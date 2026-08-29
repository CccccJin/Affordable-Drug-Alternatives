"""Render the stratified evaluation report."""
from __future__ import annotations

from datetime import date


def pct(x):
    return f"{x * 100:.1f}%" if isinstance(x, (int, float)) else "n/a"


def num(x, nd=3):
    return f"{x:.{nd}f}" if isinstance(x, (int, float)) else "n/a"


STRATUM_LABEL = {
    "hard_negative": ("Hard", "same WHO ATC level-4 subgroup, different active ingredient"),
    "medium_negative": ("Medium", "Morgan/Tanimoto >= 0.70, not therapeutically equivalent"),
    "easy_negative": ("Easy", "random pairing"),
}


def medium_tier_composition(split: str) -> dict | None:
    """Describe what the Tanimoto >= 0.70 tier actually contains.

    A similarity threshold is only as meaningful as the pairs it admits, so the
    report states the distribution rather than asking the reader to trust it.
    """
    try:
        import json
        from . import evalset as ES
        from .structures import build as build_struct
        from rdkit import Chem, RDLogger
        RDLogger.DisableLog("rdApp.*")
    except Exception:
        return None
    if not ES.EVALSET_JSON.exists():
        return None
    payload = json.loads(ES.EVALSET_JSON.read_text())
    med = [x for x in payload["pairs"]
           if x["stratum"] == "medium_negative" and x["split"] == split]
    if not med:
        return None
    parents = build_struct().get("parents", {})

    def tiny(key):
        smi = parents.get(key)
        if not smi:
            return True
        mol = Chem.MolFromSmiles(smi)
        return mol is None or mol.GetNumHeavyAtoms() <= 6

    bands = {"identical moiety (1.00)": 0, "0.90-0.99": 0, "0.80-0.89": 0, "0.70-0.79": 0}
    for x in med:
        t = x["tanimoto"]
        if t >= 0.999:
            bands["identical moiety (1.00)"] += 1
        elif t >= 0.90:
            bands["0.90-0.99"] += 1
        elif t >= 0.80:
            bands["0.80-0.89"] += 1
        else:
            bands["0.70-0.79"] += 1
    inorganic = sum(1 for x in med if tiny(x["ingredient_a"]) or tiny(x["ingredient_b"]))
    examples = sorted(med, key=lambda z: -z["tanimoto"])[:5]
    return {"n": len(med), "bands": bands, "inorganic": inorganic,
            "examples": [(x["ingredient_a"], x["ingredient_b"], x["tanimoto"])
                         for x in examples]}


def render(res: dict) -> str:
    L, l1, l2, e2e = [], res["layer1"], res["layer2"], res["end_to_end"]
    meta = res["meta"]
    w = L.append

    w("# Stratified Evaluation — Substitutability Pipeline")
    w("")
    w(f"Generated {date.today().isoformat()} by `python evaluate.py run`. "
      f"Reported on the **{res['split'].upper()}** split.")
    w("")
    w("## How to read these numbers")
    w("")
    w("> **The adjudicator reads FDA's therapeutic-equivalence codes; it does not "
      "predict them.** The labels come from those same codes, so layer-2 metrics "
      "do not measure classification skill on a hidden concept. What they measure "
      "is the identifier chain — RXCUI to NDC to application number to TE code — "
      "together with strength matching and `AB<n>` subgroup logic. A wrong answer "
      "here is a plumbing fault, and that is exactly what these strata are built "
      "to expose.")
    w("")
    w("The three negative strata are reported separately throughout. Merging them "
      "would let the random pairs, which are trivially separable, mask the hard "
      "ones that share a therapeutic class.")
    w("")

    # --- dataset -----------------------------------------------------------
    w("## 1. Evaluation set")
    w("")
    w(f"Split by **active moiety** — no ingredient appears on both sides, so no "
      f"pair can straddle the split. Assignment is a hash of the ingredient name "
      f"(salt `{meta['split_salt']}`), fixed before the retrieval index was built.")
    w("")
    w(f"- Test fraction: **{pct(meta['test_fraction'])}** of ingredients")
    w(f"- Sampling seed: `{meta['seed']}`")
    w(f"- Tanimoto threshold for the medium tier: **{meta['tanimoto_threshold']}**")
    w(f"- Manifest SHA-256: `{meta['manifest_sha256'][:32]}…`")
    w("")
    att = meta.get("attrition") or {}
    if att:
        w("Attrition during construction:")
        w("")
        w("| Cause | Pairs |")
        w("|---|---:|")
        for k, v in att.items():
            w(f"| {k.replace('_', ' ')} | {v:,} |")
        w("")

    # --- layer 1 -----------------------------------------------------------
    w("## 2. Layer 1 — retrieval (recall@k)")
    w("")
    w("Candidate generation by Morgan/Tanimoto similarity over active moieties. "
      "The query is the originator product; a hit means a genuine AB-equivalent "
      "reached the candidate list.")
    w("")
    n_pos = l2["positives"]["n"]
    skipped = n_pos - l1["queries"]
    w(f"Queries evaluated: **{l1['queries']}** of {n_pos} positive pairs in the split.")
    if skipped > 0:
        w("")
        w(f"> {skipped} positives ({skipped / n_pos * 100:.1f}%) are excluded from "
          "layer 1 because their active moiety has no resolved structure — the "
          "ChEMBL synonym match covers most Orange Book ingredients but not all, "
          "and a retriever cannot rank a molecule it has no fingerprint for. They "
          "remain in the layer-2 and end-to-end numbers, which do not depend on "
          "structure.")
    w("")
    w("| k | recall@k (any true equivalent) | recall@k (the specific paired product) |")
    w("|---:|---:|---:|")
    # Integer keys become strings across a JSON round-trip; look both up by the
    # same key so the two columns can never silently fall out of step.
    for k in sorted(l1["recall_any"], key=int):
        w(f"| {k} | **{pct(l1['recall_any'][k])}** | {pct(l1['recall_exact'].get(k))} |")
    w("")
    w(f"- Median rank of the first true equivalent: **{l1['median_rank_first_equivalent']}**")
    w(f"- Median number of marketed products sharing the query's active moiety: "
      f"**{l1['median_products_sharing_moiety']}** (max {l1['max_products_sharing_moiety']})")
    w("")
    w("> **What limits this number.** A structure-only retriever scores every "
      "product of the same active moiety *identically* — Tanimoto 1.0 — because "
      "fingerprints cannot see strength or dosage form. AB equivalence requires "
      "matching strength, so the retriever cannot rank the right product above "
      "the wrong strength of the same drug; ordering inside that tie is arbitrary. "
      "The 'any true equivalent' column is therefore the operationally meaningful "
      "one: the downstream adjudicator filters the tie group, and it only needs "
      "one genuine equivalent to survive into the candidate list.")
    w("")

    # --- layer 2 -----------------------------------------------------------
    w("## 3. Layer 2 — adjudication, by negative difficulty")
    w("")
    p = l2["positives"]
    w(f"Positives: **{p['n']}** pairs, **{p['graded_A']}** graded A "
      f"(recall **{pct(p['recall'])}**), {p['missed']} missed.")
    w("")
    w(f"Grade distribution on positives: "
      + ", ".join(f"`{g}` {n}" for g, n in p["grade_breakdown"].items()))
    w("")
    w("Precision is computed against **one stratum at a time**, holding the same "
      "positive set:")
    w("")
    w("| Negative stratum | Definition | n | False positives | Specificity | Precision | Recall | F1 |")
    w("|---|---|---:|---:|---:|---:|---:|---:|")
    for key in ("hard_negative", "medium_negative", "easy_negative"):
        s = l2["by_stratum"].get(key)
        if not s:
            continue
        label, desc = STRATUM_LABEL[key]
        w(f"| **{label}** | {desc} | {s['n_negatives']} | {s['false_positives']} | "
          f"{pct(s['specificity'])} | {num(s['precision'])} | {num(s['recall'])} | "
          f"{num(s['f1'])} |")
    w("")
    for key in ("hard_negative", "medium_negative", "easy_negative"):
        s = l2["by_stratum"].get(key)
        if not s:
            continue
        label, _ = STRATUM_LABEL[key]
        w(f"- **{label}** grade distribution: "
          + ", ".join(f"`{g}` {n}" for g, n in s["grade_breakdown"].items()))
    w("")

    comp = medium_tier_composition(res["split"])
    if comp:
        w("### What the medium tier actually contains")
        w("")
        w("A similarity threshold is only as meaningful as the pairs it admits:")
        w("")
        w("| Tanimoto band | Pairs |")
        w("|---|---:|")
        for band, n in comp["bands"].items():
            w(f"| {band} | {n} |")
        w("")
        w(f"The {comp['bands']['identical moiety (1.00)']} pairs at 1.00 are the "
          "hardest negatives available: an identical active moiety in a different "
          "salt or ester form, which no fingerprint can separate. Examples:")
        w("")
        for a, b, t in comp["examples"]:
            w(f"- `{t:.3f}` {a} vs {b}")
        w("")
        if comp["inorganic"]:
            w(f"> **Caveat.** {comp['inorganic']} of {comp['n']} pairs are mineral or "
              "electrolyte salts where the active species is the cation, but the "
              "largest-organic-fragment rule selects the shared anion — so potassium "
              "chloride and sodium chloride both reduce to `[Cl-]` and score 1.00. "
              "These are legitimate failures of structure-based retrieval on "
              "inorganics, not mislabelled pairs, but they are not organic "
              "near-misses either.")
            w("")

    # --- end to end --------------------------------------------------------
    w("## 4. End-to-end — top-1 recommendation")
    w("")
    w("Given an originator, the pipeline retrieves candidates, filters them with "
      "the adjudicator's own `a_grade_group` (the same call `price_compare` "
      "makes, not the ground-truth function), ranks by NADAC unit price, and "
      "returns the cheapest. A recommendation counts as correct only if the "
      "Orange Book independently rates it AB-equivalent to the query.")
    w("")
    w(f"| Metric | Value |")
    w("|---|---:|")
    w(f"| Originators evaluated | {e2e['queries']} |")
    w(f"| Top-1 is a true AB-equivalent | {e2e['top1_correct']} |")
    w(f"| **Top-1 accuracy** | **{pct(e2e['top1_accuracy'])}** |")
    w(f"| No recommendation returned | {e2e['no_recommendation']} |")
    w("")
    if e2e.get("failures"):
        w("Failures, for inspection:")
        w("")
        w("| Query | Query strength | Top-1 returned | Top-1 strength |")
        w("|---|---|---|---|")
        for f in e2e["failures"]:
            w(f"| {f.get('query')} | {f.get('query_strength', '')} | "
              f"{f.get('top1')} | {f.get('top1_strength', '')} |")
        w("")
    if e2e.get("examples"):
        w("<details><summary>Sample recommendations</summary>")
        w("")
        w("| Query | Top-1 | Correct |")
        w("|---|---|---|")
        for d in e2e["examples"]:
            w(f"| {d.get('query')} | {d.get('top1') or '—'} | "
              f"{'yes' if d.get('correct') else 'no'} |")
        w("")
        w("</details>")
        w("")

    # --- limitations -------------------------------------------------------
    w("## 5. What this evaluation does not establish")
    w("")
    w("1. **Not a prediction task.** Ground truth and the adjudicator both derive "
      "from Orange Book TE codes. High layer-2 scores mean the identifier chain "
      "resolves correctly, not that the system discovered equivalence.")
    w("2. **Positives are restricted to mappable pairs.** A pair is only usable "
      "when both products reach an RXCUI, so products outside the mapping are "
      "absent from the numerator and the denominator alike. Section 1 reports "
      "that attrition.")
    w("3. **The dose-form filter is coarser than the Orange Book\'s own field.** "
      "Dosage form is pinned from RxNorm\'s `DF` relation, which separates a "
      "capsule from an orally disintegrating tablet but not `TABLET, FOR "
      "SUSPENSION` from `TABLET`, nor an enteric-coated `EN-TABS` from a plain "
      "tablet — RxNorm calls both of those \'Oral Tablet\'. Every residual "
      "end-to-end miss is this one category. Closing it needs a mapping from "
      "RxNorm dose forms onto Orange Book dosage-form strings, which does not "
      "exist in either source.")
    w("4. **Retrieval is structure-only.** No strength or dosage-form signal is "
      "available to it, which caps recall@10 whenever a molecule has many "
      "marketed products. That is a property of the retriever, not a bug.")
    w("5. **The medium tier depends on a similarity threshold.** Tanimoto >= 0.70 "
      "on Morgan radius-2 fingerprints; a different radius or threshold would "
      "change the tier's membership and therefore its difficulty.")
    w("6. **Single point in time.** Orange Book, NDC directory and NADAC all move; "
      "the manifest hash identifies the exact pair set these numbers came from.")
    return "\n".join(L) + "\n"
