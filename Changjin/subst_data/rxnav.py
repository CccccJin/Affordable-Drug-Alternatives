"""RxNorm access layer.

The task specifies RxNorm's ``RXNCONSO.RRF`` / ``RXNREL.RRF``.  Those files sit
behind a UMLS/UTS login (``download.nlm.nih.gov`` 302s to a login page), so this
module supports two interchangeable backends:

``RxNormRRF``
    Reads a local UMLS RxNorm release.  Authoritative and offline.  Used
    automatically when ``cache/rxnorm/RXNCONSO.RRF`` exists.

``RxNavREST``
    The public RxNav REST API (https://rxnav.nlm.nih.gov), no account required,
    responses cached to sqlite so a rebuild is not re-fetched.  This is the
    default so the module works for anyone without a UMLS account.

Both expose the same small interface, so :mod:`grade` never learns which one it
is talking to.  Every value returned carries the source string that produced it
so the evidence chain stays honest about provenance.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent / "cache"
RXNORM_DIR = CACHE_DIR / "rxnorm"
RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"

# RxNav asks for <=20 requests/second per IP.  Stay well under it.
_MIN_INTERVAL = 0.06

#: Term types that identify a dispensable drug product (carry NDCs).
PRODUCT_TTYS = ("SCD", "SBD", "GPCK", "BPCK")
#: Term types that identify an active moiety / ingredient.
INGREDIENT_TTYS = ("IN", "PIN", "MIN")


@dataclass
class Concept:
    """A normalised RxNorm concept plus everything the grader needs from it."""

    rxcui: str
    name: str | None = None
    tty: str | None = None
    ingredients: tuple[str, ...] = ()        # IN-level rxcuis, sorted
    ingredient_names: tuple[str, ...] = ()
    precise_ingredients: tuple[str, ...] = ()  # PIN-level rxcuis (salt/ester form)
    products: tuple[str, ...] = ()           # SCD/SBD rxcuis reachable from here
    dose_forms: tuple[str, ...] = ()         # DF names
    strengths: tuple[str, ...] = ()          # SCDC names, carry the strength text
    atc: tuple[str, ...] = ()                # ATC level-5 codes e.g. C10AA05
    ndc9: tuple[str, ...] = ()               # canonical 9-digit NDCs
    source: str = "RxNav"
    found: bool = True
    provenance: list[dict] = field(default_factory=list)

    def atc4(self) -> tuple[str, ...]:
        """ATC level-4 chemical subgroups (first 5 chars of a level-5 code)."""
        return tuple(sorted({c[:5] for c in self.atc if len(c) >= 5}))


class _Cache:
    """Tiny sqlite-backed HTTP cache; keeps rebuilds cheap and reproducible."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path))
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS http_cache ("
            "  url TEXT PRIMARY KEY, fetched_at REAL, payload TEXT)"
        )
        self.conn.commit()

    def get(self, url: str):
        row = self.conn.execute(
            "SELECT payload FROM http_cache WHERE url = ?", (url,)
        ).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, url: str, payload) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO http_cache VALUES (?, ?, ?)",
            (url, time.time(), json.dumps(payload)),
        )
        self.conn.commit()


class RxNavREST:
    """Public RxNav REST backend (no UMLS account needed)."""

    source = "RxNav REST API (rxnav.nlm.nih.gov)"

    def __init__(self, cache_path: Path | None = None, offline: bool = False):
        self.cache = _Cache(cache_path or (CACHE_DIR / "rxnav_cache.sqlite"))
        self.offline = offline
        self._last_call = 0.0

    def _get(self, path: str, **params):
        url = f"{RXNAV_BASE}/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        hit = self.cache.get(url)
        if hit is not None:
            return hit
        if self.offline:
            return {}
        gap = time.time() - self._last_call
        if gap < _MIN_INTERVAL:
            time.sleep(_MIN_INTERVAL - gap)
        payload: dict = {}
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "substitutability/1.0 (research)"}
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    payload = json.loads(resp.read().decode("utf-8") or "{}")
                break
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    payload = {}
                    break
                if attempt == 2:
                    raise
                time.sleep(1.5 * (attempt + 1))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                if attempt == 2:
                    raise
                time.sleep(1.5 * (attempt + 1))
        self._last_call = time.time()
        self.cache.put(url, payload)
        return payload

    # -- interface ---------------------------------------------------------
    def concept(self, rxcui: str) -> Concept:
        rxcui = str(rxcui).strip()
        prov: list[dict] = []

        props = (self._get(f"rxcui/{rxcui}/properties.json") or {}).get("properties") or {}
        if not props:
            return Concept(rxcui=rxcui, found=False, source=self.source)
        prov.append(
            {
                "source": "RxNorm via RxNav",
                "endpoint": f"/REST/rxcui/{rxcui}/properties.json",
                "field": "properties.name/tty",
                "value": f"{props.get('name')} [{props.get('tty')}]",
            }
        )

        # RxNav wants the tty list separated by literal "+" characters.
        # urlencode maps a space to "+" but would escape a literal "+" to %2B,
        # which the API rejects with HTTP 400 -- so pass spaces here.
        rel = self._get(
            f"rxcui/{rxcui}/related.json",
            tty="IN PIN MIN SCD SBD SCDC DF",
        )
        groups = {
            g["tty"]: g.get("conceptProperties") or []
            for g in ((rel.get("relatedGroup") or {}).get("conceptGroup") or [])
            if g.get("tty")
        }
        if groups:
            prov.append(
                {
                    "source": "RxNorm via RxNav",
                    "endpoint": f"/REST/rxcui/{rxcui}/related.json?tty=IN+PIN+MIN+SCD+SBD+SCDC+DF",
                    "field": "relatedGroup.conceptGroup",
                    "value": ", ".join(f"{k}={len(v)}" for k, v in sorted(groups.items())),
                }
            )

        def cuis(tty):
            return tuple(sorted({c["rxcui"] for c in groups.get(tty, [])}))

        def names(tty):
            return tuple(sorted({c["name"] for c in groups.get(tty, []) if c.get("name")}))

        ingredients = cuis("IN")
        ing_names = names("IN")
        # A concept that *is* an ingredient is not returned in its own related set.
        if props.get("tty") in INGREDIENT_TTYS and rxcui not in ingredients:
            ingredients = tuple(sorted(set(ingredients) | {rxcui}))
            if props.get("name"):
                ing_names = tuple(sorted(set(ing_names) | {props["name"]}))

        if props.get("tty") in PRODUCT_TTYS:
            # A dispensable-product concept stands for itself. Expanding an SBD
            # into its SCD (and vice versa) would make brand and generic resolve
            # to one identical NDC set, collapsing the very comparison we are
            # being asked to make.
            products = (rxcui,)
        else:
            products = tuple(sorted(set(cuis("SCD")) | set(cuis("SBD"))))

        atc = self._atc_codes(rxcui, ingredients, prov)
        ndc9 = self._ndcs(products, prov)

        return Concept(
            rxcui=rxcui,
            name=props.get("name"),
            tty=props.get("tty"),
            ingredients=ingredients,
            ingredient_names=ing_names,
            precise_ingredients=cuis("PIN"),
            products=products,
            dose_forms=names("DF"),
            strengths=names("SCDC"),
            atc=atc,
            ndc9=ndc9,
            source=self.source,
            provenance=prov,
        )

    def _atc_codes(self, rxcui, ingredients, prov) -> tuple[str, ...]:
        """ATC level-5 codes, looked up on the ingredient when the product has none.

        RxNorm attaches ATC codes at the ingredient level, so a SCD/SBD rxcui
        usually has to be walked back to its IN before a code appears.
        """
        found: set[str] = set()
        for cui in (rxcui, *ingredients):
            payload = self._get(f"rxcui/{cui}/allProperties.json", prop="codes")
            concepts = (payload.get("propConceptGroup") or {}).get("propConcept") or []
            codes = {
                c["propValue"]
                for c in concepts
                if c.get("propName") == "ATC" and c.get("propValue")
            }
            if codes:
                found |= codes
                prov.append(
                    {
                        "source": "WHO ATC via RxNorm/RxNav",
                        "endpoint": f"/REST/rxcui/{cui}/allProperties.json?prop=codes",
                        "field": "propConcept[propName=ATC].propValue",
                        "value": ", ".join(sorted(codes)),
                    }
                )
            if found:
                break
        return tuple(sorted(found))

    def _ndcs(self, products, prov) -> tuple[str, ...]:
        from .ndcutil import normalize_ndc9

        out: set[str] = set()
        for cui in products[:40]:          # guard against pathological fan-out
            payload = self._get(f"rxcui/{cui}/ndcs.json")
            raw = ((payload.get("ndcGroup") or {}).get("ndcList") or {}).get("ndc") or []
            norm = {n for n in (normalize_ndc9(x) for x in raw) if n}
            if norm:
                out |= norm
                prov.append(
                    {
                        "source": "RxNorm via RxNav",
                        "endpoint": f"/REST/rxcui/{cui}/ndcs.json",
                        "field": "ndcGroup.ndcList.ndc",
                        "value": f"{len(norm)} distinct 9-digit NDCs",
                    }
                )
        return tuple(sorted(out))


class RxNormRRF:
    """Local UMLS RxNorm release backend (RXNCONSO / RXNREL / RXNSAT)."""

    source = "RxNorm UMLS release (RXNCONSO.RRF/RXNREL.RRF/RXNSAT.RRF)"

    def __init__(self, directory: Path | None = None):
        self.dir = Path(directory or RXNORM_DIR)
        self.conso = self.dir / "RXNCONSO.RRF"
        self.rel = self.dir / "RXNREL.RRF"
        self.sat = self.dir / "RXNSAT.RRF"
        if not self.conso.exists():
            raise FileNotFoundError(f"RXNCONSO.RRF not found under {self.dir}")
        self._loaded = False

    @staticmethod
    def available(directory: Path | None = None) -> bool:
        return (Path(directory or RXNORM_DIR) / "RXNCONSO.RRF").exists()

    def _load(self):
        if self._loaded:
            return
        self.names: dict[str, tuple[str, str]] = {}
        self.atc: dict[str, set[str]] = {}
        self.ndc: dict[str, set[str]] = {}
        self.rels: dict[str, set[tuple[str, str]]] = {}

        from .ndcutil import normalize_ndc9

        with self.conso.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                f = line.split("|")
                if len(f) < 15 or f[1] != "ENG":
                    continue
                rxcui, sab, tty, code, string = f[0], f[11], f[12], f[13], f[14]
                if sab == "RXNORM" and rxcui not in self.names:
                    self.names[rxcui] = (string, tty)
                if sab == "ATC" and code:
                    self.atc.setdefault(rxcui, set()).add(code)

        if self.sat.exists():
            with self.sat.open(encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    f = line.split("|")
                    if len(f) < 11 or f[8] != "NDC":
                        continue
                    n9 = normalize_ndc9(f[10])
                    if n9:
                        self.ndc.setdefault(f[0], set()).add(n9)

        if self.rel.exists():
            with self.rel.open(encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    f = line.split("|")
                    if len(f) < 11 or f[10] != "RXNORM":
                        continue
                    # RXNREL is stored "2 -> 1"; index from the concept outward.
                    cui1, cui2, rela = f[0], f[4], f[7]
                    if cui1 and cui2 and rela:
                        self.rels.setdefault(cui2, set()).add((rela, cui1))
        self._loaded = True

    def concept(self, rxcui: str) -> Concept:
        self._load()
        rxcui = str(rxcui).strip()
        if rxcui not in self.names:
            return Concept(rxcui=rxcui, found=False, source=self.source)
        name, tty = self.names[rxcui]
        prov = [
            {
                "source": "RxNorm RXNCONSO.RRF",
                "endpoint": str(self.conso.name),
                "field": "RXCUI/STR/TTY",
                "value": f"{name} [{tty}]",
            }
        ]

        related = self.rels.get(rxcui, set())
        ingredients, products, strengths, dose_forms = set(), set(), set(), set()
        for rela, other in related:
            otty = self.names.get(other, ("", ""))[1]
            if otty in ("IN", "PIN", "MIN"):
                ingredients.add(other)
            elif otty in PRODUCT_TTYS and tty not in PRODUCT_TTYS:
                products.add(other)
            elif otty == "SCDC":
                strengths.add(self.names[other][0])
            elif otty == "DF":
                dose_forms.add(self.names[other][0])
        if tty in INGREDIENT_TTYS:
            ingredients.add(rxcui)
        if tty in PRODUCT_TTYS:
            products = {rxcui}          # see RxNavREST.concept for the rationale
        if related:
            prov.append(
                {
                    "source": "RxNorm RXNREL.RRF",
                    "endpoint": str(self.rel.name),
                    "field": "RXCUI1/RXCUI2/RELA",
                    "value": f"{len(related)} RXNORM relationships",
                }
            )

        atc: set[str] = set()
        for cui in (rxcui, *sorted(ingredients)):
            if self.atc.get(cui):
                atc |= self.atc[cui]
                prov.append(
                    {
                        "source": "WHO ATC via RXNCONSO.RRF (SAB=ATC)",
                        "endpoint": str(self.conso.name),
                        "field": "CODE where SAB='ATC'",
                        "value": ", ".join(sorted(self.atc[cui])),
                    }
                )
                break

        ndc9: set[str] = set()
        for cui in (rxcui, *sorted(products)):
            ndc9 |= self.ndc.get(cui, set())

        return Concept(
            rxcui=rxcui,
            name=name,
            tty=tty,
            ingredients=tuple(sorted(ingredients)),
            ingredient_names=tuple(sorted(self.names[i][0] for i in ingredients if i in self.names)),
            products=tuple(sorted(products)),
            dose_forms=tuple(sorted(dose_forms)),
            strengths=tuple(sorted(strengths)),
            atc=tuple(sorted(c for c in atc if len(c) == 7)) or tuple(sorted(atc)),
            ndc9=tuple(sorted(ndc9)),
            source=self.source,
            provenance=prov,
        )


def get_backend(prefer_rrf: bool = True, offline: bool = False):
    """Return the best available RxNorm backend.

    Local UMLS RRF files win when present; otherwise the public RxNav API.
    """
    if prefer_rrf and RxNormRRF.available():
        return RxNormRRF()
    return RxNavREST(offline=offline)
