"""Choose the layer-1 retrieval configuration -- on the DEV split only.

Kept in a separate entry point from :mod:`evaluate` so the boundary is visible
in the command history: this reads ``split == "dev"`` and nothing else. The
selected configuration is written to ``cache/retrieval_config.json`` and the
test run loads it without re-deriving anything.

The adjudicator itself has no fitted parameters -- it is rule-based over FDA
data -- so retrieval is the only place a choice could be overfitted.
"""
from __future__ import annotations

import json
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
CONFIG_JSON = CACHE / "retrieval_config.json"

CANDIDATES = [
    {"radius": 2, "fp_size": 2048},
    {"radius": 3, "fp_size": 2048},
    {"radius": 2, "fp_size": 1024},
]


def fingerprints_for(config, smiles_by_key):
    from rdkit import Chem, RDLogger
    from rdkit.Chem import rdFingerprintGenerator
    from .structures import active_moiety
    RDLogger.DisableLog("rdApp.*")
    gen = rdFingerprintGenerator.GetMorganGenerator(
        radius=config["radius"], fpSize=config["fp_size"])
    out = {}
    for key, smi in smiles_by_key.items():
        mol = active_moiety(smi)
        if mol is None:
            continue
        try:
            Chem.SanitizeMol(mol)
            out[key] = gen.GetFingerprint(mol)
        except Exception:
            continue
    return out


def main():
    import evaluate as EV
    from .structures import build as build_struct

    struct = build_struct()
    ev = EV.Evaluator(split="dev")
    n_dev = len([p for p in ev.pairs if p["stratum"] == "positive"])
    print(f"Tuning retrieval on the DEV split ({n_dev} positive queries).")
    print("The test split is not read by this command.\n")

    rows = []
    for cfg in CANDIDATES:
        ev.retr.fps = fingerprints_for(cfg, struct["smiles"])
        ev.retr.ing_keys = sorted(k for k in ev.retr.by_ingredient if k in ev.retr.fps)
        res = ev.layer1()
        rows.append((cfg, res))
        r = res["recall_any"]
        print(f"  radius={cfg['radius']} bits={cfg['fp_size']:<5} "
              f"recall@10={r[10]:.3f}  @50={r[50]:.3f}  @100={r[100]:.3f}")

    best_cfg, best_res = max(rows, key=lambda t: (t[1]["recall_any"][10],
                                                  t[1]["recall_any"][50]))
    CONFIG_JSON.write_text(json.dumps({
        "chosen": best_cfg,
        "selected_on": "dev",
        "dev_recall_any": {str(k): v for k, v in best_res["recall_any"].items()},
        "candidates_considered": CANDIDATES,
    }, indent=1))
    print(f"\nChosen on dev: radius={best_cfg['radius']}, "
          f"fp_size={best_cfg['fp_size']}  ->  {CONFIG_JSON.name}")
    return 0
