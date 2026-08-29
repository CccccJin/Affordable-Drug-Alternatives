"""Resolve Orange Book ingredients to RxNorm ingredient concepts and ATC codes.

The hard-negative tier is defined as "same WHO ATC level-4 chemical subgroup,
different active ingredient", so building it needs an ATC code for every
ingredient in the corpus rather than for one drug at a time.

Results are cached in the shared RxNav sqlite cache, so this is a one-time cost.
"""
from __future__ import annotations

import json
import pickle
import sys
import urllib.parse
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
ATC_PKL = CACHE / "ingredient_atc.pkl"


def resolve(ingredients: dict, backend=None, limit: int | None = None) -> dict:
    """Map each ingredient key to ``{rxcui, name, atc[], atc4[]}``.

    Two hops: the base moiety name resolves to an RxNorm ``IN`` concept, and
    that concept carries the ATC codes. Salt words are already stripped by
    :func:`subst_data.structures.base_moiety`, which matters because RxNorm
    names ingredients by moiety while the Orange Book names them by salt.
    """
    from . import rxnav
    backend = backend or rxnav.RxNavREST()

    out: dict[str, dict] = {}
    items = list(ingredients.items())[:limit] if limit else list(ingredients.items())
    for i, (key, meta) in enumerate(items, 1):
        if i % 200 == 0:
            print(f"    {i}/{len(items)} ...", flush=True)
        name = meta["base"] or meta["ingredient"]
        payload = backend._get("rxcui.json", name=name, search="2")
        ids = (payload.get("idGroup") or {}).get("rxnormId") or []
        if not ids:
            out[key] = {"rxcui": None, "atc": [], "atc4": []}
            continue
        rxcui = ids[0]
        props = backend._get(f"rxcui/{rxcui}/allProperties.json", prop="codes")
        concepts = (props.get("propConceptGroup") or {}).get("propConcept") or []
        atc = sorted({c["propValue"] for c in concepts
                      if c.get("propName") == "ATC" and c.get("propValue")})
        out[key] = {
            "rxcui": rxcui,
            "atc": atc,
            "atc4": sorted({c[:5] for c in atc if len(c) >= 5}),
        }
    return out


def build(force: bool = False) -> dict:
    if ATC_PKL.exists() and not force:
        with ATC_PKL.open("rb") as fh:
            return pickle.load(fh)
    from .structures import build as build_struct
    struct = build_struct()
    ing = {k: v for k, v in struct["ingredients"].items() if k in struct["fps"]}
    print(f"  resolving ATC for {len(ing):,} ingredients via RxNav (cached) ...", flush=True)
    atc = resolve(ing)
    n = sum(1 for v in atc.values() if v["atc"])
    print(f"  ATC codes for {n:,} of {len(atc):,} ({n / len(atc) * 100:.1f}%)", flush=True)
    with ATC_PKL.open("wb") as fh:
        pickle.dump(atc, fh)
    return atc


if __name__ == "__main__":
    a = build(force="--force" in sys.argv)
    import collections
    c = collections.Counter(len(v["atc4"]) for v in a.values())
    print("ATC4 codes per ingredient:", dict(sorted(c.items())))
    groups = collections.Counter()
    for v in a.values():
        for g in v["atc4"]:
            groups[g] += 1
    multi = {g: n for g, n in groups.items() if n > 1}
    print(f"ATC4 subgroups containing >1 ingredient: {len(multi):,}")
    print(f"cached to {ATC_PKL}")
