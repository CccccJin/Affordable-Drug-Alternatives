"""NDC and FDA application-number normalisation.

The three authoritative sources spell the same identifier three different ways,
and joining them naively is the single largest source of silent mapping loss:

* openFDA NDC directory  -> ``product_ndc`` keeps the *original* segment widths
  ("0093-5058" has a 4-digit labeler, "50090-5208" has a 5-digit labeler).
* RxNav / RxNorm         -> 11-digit zero-padded 5-4-2 ("00093505810").
* Orange Book            -> no NDC at all; only ``Appl_Type`` + ``Appl_No``.

Everything here funnels those into one canonical form so the joins are exact
rather than approximate.
"""
from __future__ import annotations

import re

__all__ = ["normalize_ndc9", "normalize_ndc11", "normalize_appl_no", "orange_book_appl_no"]

_NON_DIGIT = re.compile(r"[^0-9]")


def normalize_ndc9(ndc: str | None) -> str | None:
    """Canonicalise any NDC spelling to the 9-digit labeler+product code.

    The 9-digit (5-4) product code is the coarsest identifier that is still
    unambiguous, and it is the level at which openFDA and RxNorm actually agree.
    Package-level digits are deliberately discarded.

    >>> normalize_ndc9("0093-5058")       # openFDA, 4-digit labeler
    '000935058'
    >>> normalize_ndc9("00093505810")     # RxNav, 11-digit 5-4-2
    '000935058'
    >>> normalize_ndc9("50090-5208")      # openFDA, 5-digit labeler
    '500905208'
    """
    if not ndc:
        return None
    raw = ndc.strip()
    if not raw:
        return None

    parts = raw.split("-")
    if len(parts) >= 2:
        # Hyphenated: segment boundaries are explicit, so pad each segment.
        labeler = _NON_DIGIT.sub("", parts[0])
        product = _NON_DIGIT.sub("", parts[1])
        if not labeler or not product:
            return None
        if len(labeler) > 5 or len(product) > 4:
            return None
        return labeler.rjust(5, "0") + product.rjust(4, "0")

    digits = _NON_DIGIT.sub("", raw)
    if len(digits) == 11:      # 5-4-2 packaged form
        return digits[:9]
    if len(digits) == 10:      # ambiguous unhyphenated; assume 5-4-1 is invalid
        return None
    if len(digits) == 9:       # already canonical
        return digits
    return None


def normalize_ndc11(ndc: str | None) -> str | None:
    """Return the 11-digit 5-4-2 form when the package segment is recoverable."""
    if not ndc:
        return None
    parts = ndc.strip().split("-")
    if len(parts) == 3:
        labeler, product, package = (_NON_DIGIT.sub("", p) for p in parts)
        if not (labeler and product and package):
            return None
        if len(labeler) > 5 or len(product) > 4 or len(package) > 2:
            return None
        return labeler.rjust(5, "0") + product.rjust(4, "0") + package.rjust(2, "0")
    digits = _NON_DIGIT.sub("", ndc)
    return digits if len(digits) == 11 else None


_APPL_RE = re.compile(r"^(ANDA|NDA|BLA|BN)\s*0*(\d+)$", re.I)


def normalize_appl_no(appl: str | None) -> str | None:
    """Canonicalise an FDA application number to ``<TYPE><6 digits>``.

    openFDA writes "ANDA209288" / "NDA021436" / "BLA125057"; the Orange Book
    stores the type and the digits in separate columns; the Purple Book stores
    bare BLA digits.  All three land on the same string here.

    >>> normalize_appl_no("ANDA 9288")
    'ANDA009288'
    >>> normalize_appl_no("BLA125057")
    'BLA125057'
    """
    if not appl:
        return None
    m = _APPL_RE.match(appl.strip())
    if not m:
        return None
    kind = m.group(1).upper()
    if kind == "BN":           # openFDA spells some biologics "BN"
        kind = "BLA"
    return f"{kind}{m.group(2).zfill(6)}"


def orange_book_appl_no(appl_type: str, appl_no: str) -> str | None:
    """Build the canonical application number from Orange Book columns.

    ``Appl_Type`` is ``N`` (NDA) or ``A`` (ANDA); ``Appl_No`` is the bare number.
    """
    kind = {"N": "NDA", "A": "ANDA"}.get((appl_type or "").strip().upper())
    if not kind:
        return None
    digits = _NON_DIGIT.sub("", appl_no or "")
    return f"{kind}{digits.zfill(6)}" if digits else None
