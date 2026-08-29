"""Download the raw authoritative sources into ``cache/``.

Every URL here is public and needs no account.  The one source that *does*
require a login is the UMLS RxNorm release (``RXNCONSO.RRF`` / ``RXNREL.RRF``);
:func:`rxnorm_status` explains how to drop it in, and the module falls back to
the public RxNav API when it is absent.
"""
from __future__ import annotations

import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"

ORANGE_BOOK_URL = "https://www.fda.gov/media/76860/download?attachment"
OPENFDA_NDC_URL = "https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip"
PURPLE_BOOK_INDEX = "https://purplebooksearch.fda.gov/downloads"
UMLS_RXNORM_URL = "https://download.nlm.nih.gov/umls/kss/rxnorm/RxNorm_full_current.zip"

_UA = {"User-Agent": "substitutability/1.0 (research)"}


def _get(url: str, timeout: int = 600) -> bytes:
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_orange_book(force: bool = False) -> Path:
    """FDA Orange Book: products.txt, patent.txt, exclusivity.txt."""
    out = CACHE / "orangebook"
    out.mkdir(parents=True, exist_ok=True)
    if (out / "products.txt").exists() and not force:
        print(f"  Orange Book: cached ({out})")
        return out
    print("  Orange Book: downloading ...")
    blob = _get(ORANGE_BOOK_URL)
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        zf.extractall(out)
    print(f"  Orange Book: extracted to {out}")
    return out


def fetch_openfda_ndc(force: bool = False) -> Path:
    """openFDA NDC Directory: the RXCUI <-> application-number bridge."""
    out = CACHE / "openfda"
    out.mkdir(parents=True, exist_ok=True)
    target = out / "drug-ndc-0001-of-0001.json"
    if target.exists() and not force:
        print(f"  openFDA NDC: cached ({target.name})")
        return target
    print("  openFDA NDC: downloading ~27 MB ...")
    blob = _get(OPENFDA_NDC_URL)
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        zf.extractall(out)
    print(f"  openFDA NDC: extracted to {target}")
    return target


def fetch_purple_book(force: bool = False) -> Path | None:
    """FDA Purple Book: licensed biologics, biosimilars and interchangeables.

    The download page lists one CSV per month; each is a *cumulative* extract,
    so the newest one is taken.
    """
    out = CACHE / "purplebook"
    out.mkdir(parents=True, exist_ok=True)
    target = out / "purplebook.csv"
    if target.exists() and not force:
        print(f"  Purple Book: cached ({target.name})")
        return target
    print("  Purple Book: locating newest monthly extract ...")
    html = _get(PURPLE_BOOK_INDEX, timeout=60).decode("utf-8", "replace")
    links = re.findall(r'href="(https://[^"]*PurpleBook[^"]*\.csv)"', html, re.I)
    if not links:
        print("  Purple Book: no CSV link found; biologic branch will be inactive")
        return None
    url = _newest_purple_book(links)
    target.write_bytes(_get(url, timeout=180))
    print(f"  Purple Book: saved {url.rsplit('/', 1)[-1]}")
    return target


_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}


def _newest_purple_book(links: list[str]) -> str:
    """Pick the most recent monthly extract.

    The download page groups links by year (newest year first) but lists the
    months *ascending* within each year, so the first link on the page is
    January -- up to eleven months stale. Sort on (year, month) instead.
    """
    def key(url: str):
        year = re.search(r"/(20\d\d)/", url)
        month = re.search(r"search-([A-Za-z]+)-data", url)
        return (int(year.group(1)) if year else 0,
                _MONTHS.get(month.group(1).lower(), 0) if month else 0)

    return max(links, key=key)


def rxnorm_status() -> str:
    """Report whether a local UMLS RxNorm release is available."""
    rrf = CACHE / "rxnorm" / "RXNCONSO.RRF"
    if rrf.exists():
        return f"  RxNorm: using local UMLS release at {rrf.parent}"
    return (
        "  RxNorm: no local UMLS release -- using the public RxNav API instead.\n"
        "          RXNCONSO.RRF/RXNREL.RRF/RXNSAT.RRF require a free UMLS account:\n"
        f"            1. register at https://uts.nlm.nih.gov/uts/signup-login\n"
        f"            2. download {UMLS_RXNORM_URL}\n"
        f"            3. unzip rrf/*.RRF into {CACHE / 'rxnorm'}/\n"
        "          The module then switches to the offline release automatically."
    )


def fetch_all(force: bool = False) -> None:
    print("Fetching authoritative sources into", CACHE)
    fetch_orange_book(force)
    fetch_openfda_ndc(force)
    fetch_purple_book(force)
    print(rxnorm_status())
    print("\nNext: python substitutability.py build")


if __name__ == "__main__":
    fetch_all()
