#!/usr/bin/env python3
"""Stratified evaluation of the substitutability pipeline.

Three layers, reported separately, because a single number would hide where the
pipeline actually fails.

``Layer 1 -- retrieval``
    Structure-based candidate generation. Morgan/Tanimoto over active moieties.
    Reports recall@10 / @50 / @100: does a genuine AB-equivalent reach the
    candidate list at all?

``Layer 2 -- adjudication``
    Precision / recall / F1 of the grade-A decision, computed **once per negative
    stratum**. Merging the three strata into one number would let the easy
    negatives mask the hard ones, so it is never done here.

``End-to-end``
    Given an originator, is the top-1 recommendation a genuine AB-equivalent?

**Read the layer-2 numbers correctly.** The adjudicator reads FDA's therapeutic
equivalence codes; it does not predict them. The labels come from those same
codes, so these metrics test the identifier chain -- RXCUI to NDC to application
to TE code -- plus strength matching and ``AB<n>`` subgroup logic. They are a
measure of plumbing correctness, not of classification skill.

The dev/test split is by active moiety and is frozen, with a manifest hash,
before the retrieval index is built. Retrieval configuration is chosen on dev;
every headline number is reported on test.

    python evaluate.py build          # construct + split the evaluation set
    python evaluate.py tune           # choose retrieval config on DEV only
    python evaluate.py run            # evaluate on TEST, write the report
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from subst_data import evalset as ES  # noqa: E402
from subst_data.grade import Adjudicator, te_subgroups  # noqa: E402
from subst_data.structures import build as build_structures  # noqa: E402

CACHE = Path(__file__).resolve().parent / "subst_data" / "cache"
RESULTS_JSON = CACHE / "eval_results.json"
REPORT_MD = Path(__file__).resolve().parent / "EVALUATION_REPORT.md"

K_VALUES = (10, 50, 100)


# ---------------------------------------------------------------- retrieval
class Retriever:
    """Layer-1 candidate generation by molecular similarity.

    The corpus is every marketed Orange Book product whose active moiety has a
    fingerprint. Scoring is ingredient-level, so all products sharing a moiety
    tie exactly -- which is the honest behaviour of a structure-only retriever
    and the single most important thing these metrics reveal.
    """

    def __init__(self, adjudicator: Adjudicator, seed: int = 7):
        import random
        self.conn = adjudicator.conn
        self.struct = build_structures()
        self.fps = self.struct["fps"]
        self.rng = random.Random(seed)

        self.products = [
            r for r in self.conn.execute(
                "SELECT appl_no, product_no, ingredient_key, ingredient, dosage_form, "
                "route, strength, strength_key, te_code, appl_type, trade_name "
                "FROM ob_product WHERE mkt_type = 'RX'")
            if r["ingredient_key"] in self.fps
        ]
        self.by_ingredient: dict[str, list] = defaultdict(list)
        for r in self.products:
            self.by_ingredient[r["ingredient_key"]].append(r)
        self.ing_keys = sorted(self.by_ingredient)
        # A stable random jitter per product, used only to break exact ties.
        # It is label-blind: drawn from the product id, never from the label.
        self._jitter = {(r["appl_no"], r["product_no"]): self.rng.random()
                        for r in self.products}

    def similar_ingredients(self, query_key: str) -> list[tuple[str, float]]:
        from rdkit import DataStructs
        if query_key not in self.fps:
            return []
        sims = DataStructs.BulkTanimotoSimilarity(
            self.fps[query_key], [self.fps[k] for k in self.ing_keys])
        return sorted(zip(self.ing_keys, sims), key=lambda t: -t[1])

    def candidates(self, query_row, k: int) -> list:
        """Top-k products by descending Tanimoto, excluding the query product."""
        ranked = self.similar_ingredients(query_row["ingredient_key"])
        out = []
        for ing_key, sim in ranked:
            if sim <= 0:
                break
            bucket = self.by_ingredient[ing_key]
            # Deterministic, label-blind ordering inside an exact-score tie.
            bucket = sorted(bucket, key=lambda r: self._jitter[(r["appl_no"], r["product_no"])])
            for r in bucket:
                if (r["appl_no"] == query_row["appl_no"]
                        and r["product_no"] == query_row["product_no"]):
                    continue
                out.append((r, sim))
                if len(out) >= k:
                    return out
        return out

    def tie_group_size(self, query_key: str) -> int:
        return len(self.by_ingredient.get(query_key, []))


def is_ab_equivalent(a, b) -> bool:
    """Orange Book ground truth: same group, intersecting AB subgroups."""
    if a["ingredient_key"] != b["ingredient_key"]:
        return False
    if a["dosage_form"] != b["dosage_form"] or a["route"] != b["route"]:
        return False
    if a["strength_key"] != b["strength_key"]:
        return False
    sa, sb = te_subgroups(a["te_code"]), te_subgroups(b["te_code"])
    shared = sa & sb
    return bool(shared) and any(c.startswith("AB") for c in shared)


# --------------------------------------------------------------- evaluation
@dataclass
class Metrics:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    @property
    def precision(self):
        d = self.tp + self.fp
        return self.tp / d if d else None

    @property
    def recall(self):
        d = self.tp + self.fn
        return self.tp / d if d else None

    @property
    def f1(self):
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p and r else (0.0 if (p is not None and r is not None) else None)

    def as_dict(self):
        return {"tp": self.tp, "fp": self.fp, "fn": self.fn, "tn": self.tn,
                "precision": self.precision, "recall": self.recall, "f1": self.f1}


class Evaluator:
    def __init__(self, split: str = "test"):
        self.adj = Adjudicator()
        self.retr = Retriever(self.adj)
        self.payload = ES.build()
        self.split = split
        self.pairs = [p for p in self.payload["pairs"] if p["split"] == split]
        self.by_appl = {}
        for r in self.retr.products:
            self.by_appl.setdefault(r["appl_no"], []).append(r)

    # -- layer 1 -----------------------------------------------------------
    def layer1(self, k_values=K_VALUES) -> dict:
        """recall@k over positive pairs, from the brand side as query."""
        positives = [p for p in self.pairs if p["stratum"] == "positive"]
        hits_any = {k: 0 for k in k_values}
        hits_exact = {k: 0 for k in k_values}
        evaluated, tie_sizes, ranks = 0, [], []
        kmax = max(k_values)

        for p in positives:
            q = self._product(p["appl_a"], p["ingredient_a"], p["strength_a"])
            t = self._product(p["appl_b"], p["ingredient_b"], p["strength_b"])
            if q is None or t is None:
                continue
            evaluated += 1
            tie_sizes.append(self.retr.tie_group_size(q["ingredient_key"]))
            cands = self.retr.candidates(q, kmax)
            first_any = first_exact = None
            for i, (r, _s) in enumerate(cands, 1):
                if first_any is None and is_ab_equivalent(q, r):
                    first_any = i
                if (first_exact is None and r["appl_no"] == t["appl_no"]
                        and r["product_no"] == t["product_no"]):
                    first_exact = i
            if first_any:
                ranks.append(first_any)
            for k in k_values:
                if first_any and first_any <= k:
                    hits_any[k] += 1
                if first_exact and first_exact <= k:
                    hits_exact[k] += 1

        return {
            "queries": evaluated,
            "recall_any": {k: hits_any[k] / evaluated if evaluated else None for k in k_values},
            "recall_exact": {k: hits_exact[k] / evaluated if evaluated else None for k in k_values},
            "median_rank_first_equivalent": statistics.median(ranks) if ranks else None,
            "median_products_sharing_moiety": statistics.median(tie_sizes) if tie_sizes else None,
            "max_products_sharing_moiety": max(tie_sizes) if tie_sizes else None,
        }

    def _product(self, appl_no, ingredient_key, strength):
        rows = self.by_appl.get(appl_no) or []
        for r in rows:
            if r["ingredient_key"] == ingredient_key and r["strength"] == strength:
                return r
        for r in rows:
            if r["ingredient_key"] == ingredient_key:
                return r
        return rows[0] if rows else None

    # -- layer 2 -----------------------------------------------------------
    def layer2(self, progress=True) -> dict:
        """Grade-A precision/recall/F1, computed once per negative stratum."""
        verdicts: dict[str, list] = defaultdict(list)
        total = len(self.pairs)
        for i, p in enumerate(self.pairs, 1):
            if progress and i % 100 == 0:
                print(f"    adjudicated {i}/{total} pairs ...", flush=True)
            v = self.adj.judge(p["rxcui_a"], p["rxcui_b"])
            verdicts[p["stratum"]].append({
                "pair": p, "grade": v.grade, "rule": v.rule_id})

        pos = verdicts["positive"]
        pos_tp = sum(1 for r in pos if r["grade"] == "A")
        pos_fn = len(pos) - pos_tp

        out = {"positives": {"n": len(pos), "graded_A": pos_tp,
                             "missed": pos_fn,
                             "recall": pos_tp / len(pos) if pos else None,
                             "grade_breakdown": self._breakdown(pos)},
               "by_stratum": {}}

        for stratum in ("hard_negative", "medium_negative", "easy_negative"):
            negs = verdicts[stratum]
            fp = sum(1 for r in negs if r["grade"] == "A")
            m = Metrics(tp=pos_tp, fp=fp, fn=pos_fn, tn=len(negs) - fp)
            out["by_stratum"][stratum] = {
                "n_negatives": len(negs),
                "false_positives": fp,
                "specificity": (len(negs) - fp) / len(negs) if negs else None,
                **m.as_dict(),
                "grade_breakdown": self._breakdown(negs),
            }
        out["_verdicts"] = {k: [{"grade": r["grade"], "rule": r["rule"],
                                 "a": r["pair"]["rxcui_a"], "b": r["pair"]["rxcui_b"],
                                 "note": r["pair"]["note"]}
                                for r in v] for k, v in verdicts.items()}
        return out

    @staticmethod
    def _breakdown(rows):
        c = defaultdict(int)
        for r in rows:
            c[r["grade"]] += 1
        return dict(sorted(c.items()))

    # -- end to end --------------------------------------------------------
    def end_to_end(self, progress=True) -> dict:
        """Run the production path and check the top-1 recommendation.

        The candidate filter is the adjudicator's own ``a_grade_group`` -- the
        same call ``price_compare`` makes -- never the ground-truth function.
        Scoring then compares the returned product against the Orange Book
        independently, so a mapping fault (wrong strength, wrong dosage form,
        wrong equivalence group) shows up as a miss rather than being hidden.

        Ranking is by NADAC unit price, because the product's purpose is finding
        a cheaper equivalent.
        """
        try:
            from price_compare import PriceComparator
            pc = PriceComparator(adjudicator=self.adj)
        except Exception:
            pc = None

        positives = [p for p in self.pairs if p["stratum"] == "positive"]
        seen, cases = set(), []
        for p in positives:
            key = (p["appl_a"], p["ingredient_a"], p["strength_a"])
            if key in seen:
                continue
            seen.add(key)
            cases.append(p)

        correct = no_rec = 0
        details = []
        for i, p in enumerate(cases, 1):
            if progress and i % 25 == 0:
                print(f"    end-to-end {i}/{len(cases)} ...", flush=True)
            q = self._product(p["appl_a"], p["ingredient_a"], p["strength_a"])
            if q is None:
                continue
            _side, members = self.adj.a_grade_group(p["rxcui_a"])
            cands = [m for m in members
                     if not (m["appl_no"] == q["appl_no"]
                             and m["product_no"] == q["product_no"])]
            if not cands:
                no_rec += 1
                details.append({"query": q["trade_name"], "query_rxcui": p["rxcui_a"],
                                "top1": None, "correct": False,
                                "reason": "adjudicator returned no grade-A alternative"})
                continue
            ranked = sorted(cands, key=lambda r: (self._price(pc, r), r["appl_no"]))
            top = ranked[0]
            ok = is_ab_equivalent(q, top)
            correct += ok
            details.append({"query": q["trade_name"], "query_rxcui": p["rxcui_a"],
                            "top1": top["trade_name"], "top1_appl": top["appl_no"],
                            "top1_strength": top["strength"], "query_strength": q["strength"],
                            "correct": bool(ok)})
        n = len(details)
        wrong = [d for d in details if not d["correct"] and d.get("top1")]
        return {
            "queries": n,
            "top1_correct": correct,
            "top1_accuracy": correct / n if n else None,
            "no_recommendation": no_rec,
            "examples": details[:12],
            "failures": wrong[:12],
        }

    @staticmethod
    def _price(pc, row) -> float:
        if pc is None:
            return float("inf")
        try:
            r = pc.conn.execute(
                "SELECT MIN(n.price_per_unit) p FROM ndc_product np "
                "JOIN nadac_price n ON n.ndc9 = np.ndc9 WHERE np.appl_no = ?",
                (row["appl_no"],)).fetchone()
            return r["p"] if r and r["p"] is not None else float("inf")
        except Exception:
            return float("inf")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="evaluate", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="construct and split the evaluation set")
    b.add_argument("--force", action="store_true")
    t = sub.add_parser("tune", help="choose retrieval configuration on DEV only")
    r = sub.add_parser("run", help="evaluate on TEST and write the report")
    r.add_argument("--split", default="test", choices=["test", "dev"])
    args = ap.parse_args(argv)

    if args.cmd == "build":
        p = ES.build(force=args.force)
        print(ES.summarise(p))
        return

    if args.cmd == "tune":
        from subst_data.tune import main as tune_main
        return tune_main()

    ev = Evaluator(split=args.split)
    print(f"Evaluating on the {args.split.upper()} split "
          f"({len(ev.pairs)} pairs)\n")
    print("  layer 1: retrieval ...", flush=True)
    l1 = ev.layer1()
    print("  layer 2: adjudication ...", flush=True)
    l2 = ev.layer2()
    print("  end-to-end ...", flush=True)
    e2e = ev.end_to_end()

    results = {"split": args.split, "meta": ev.payload["meta"],
               "layer1": l1, "layer2": l2, "end_to_end": e2e}
    RESULTS_JSON.write_text(json.dumps(results, indent=1, default=str))
    from subst_data.eval_report import render
    REPORT_MD.write_text(render(results))
    print(f"\nWrote {RESULTS_JSON}\nWrote {REPORT_MD}")


if __name__ == "__main__":
    sys.exit(main() or 0)
