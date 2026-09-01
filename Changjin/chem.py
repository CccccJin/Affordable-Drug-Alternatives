"""RDKit helpers: fingerprints, similarity and molecular descriptors.

Fingerprints here are RDKit ``ExplicitBitVect`` objects, not numpy arrays, and
similarity is computed by RDKit's own C++ routines rather than reimplemented on
top of numpy. That was not true before: the two helpers below were annotated for
numpy, reached for ``.size`` on values that never had it, and swallowed the
resulting ``AttributeError`` in a bare ``except`` — so ``calculate_similarity``
returned 0.0 for every pair including a molecule against itself, and
``get_compound_properties`` raised on every valid molecule. Both were unreachable
from the API, which is why nothing noticed.
"""
from typing import Optional, Union

from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem, rdFingerprintGenerator, rdMolDescriptors
from rdkit.DataStructs.cDataStructs import ExplicitBitVect

#: Morgan radius and width used everywhere fingerprints are stored or compared.
#: `export_demo_fingerprints.py` and the frontend read the same two numbers, so
#: a score from the static build equals one from this API.
RADIUS = 2
N_BITS = 1024

_SIMILARITY = {
    "tanimoto": DataStructs.TanimotoSimilarity,
    "dice": DataStructs.DiceSimilarity,
    "cosine": DataStructs.CosineSimilarity,
}


def smiles_to_fingerprint(smiles: str, n_bits: int = N_BITS) -> Optional[ExplicitBitVect]:
    """Morgan fingerprint of a SMILES, or None when RDKit cannot parse it."""
    if not smiles:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=RADIUS, fpSize=n_bits)
    return generator.GetFingerprint(mol)


def calculate_similarity(
    fp1: Optional[ExplicitBitVect],
    fp2: Union[ExplicitBitVect, str, None],
    metric: str = "tanimoto",
) -> float:
    """Similarity between two fingerprints, or between one and a SMILES.

    Returns 0.0 when either side is missing or unparseable — an absent molecule
    is not similar to anything. An unknown metric raises rather than silently
    scoring zero, because that is a caller mistake and not a data condition.
    """
    similarity_fn = _SIMILARITY.get(metric.lower())
    if similarity_fn is None:
        raise ValueError(
            f"Unsupported similarity metric: {metric!r}. "
            f"Expected one of {sorted(_SIMILARITY)}."
        )

    if isinstance(fp2, str):
        fp2 = smiles_to_fingerprint(fp2)
    if fp1 is None or fp2 is None:
        return 0.0
    if len(fp1) != len(fp2):
        return 0.0

    return float(similarity_fn(fp1, fp2))


def get_compound_properties(smiles: str) -> Optional[dict]:
    """RDKit descriptors for a SMILES, or None when it cannot be parsed."""
    mol = Chem.MolFromSmiles(smiles) if smiles else None
    if mol is None:
        return None

    return {
        "mw": AllChem.CalcExactMolWt(mol),
        "logp": AllChem.CalcCrippenDescriptors(mol)[0],
        "hba": AllChem.CalcNumHBA(mol),
        "hbd": AllChem.CalcNumHBD(mol),
        "rotatable_bonds": AllChem.CalcNumRotatableBonds(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        # Was `len(mol.GetRingInfo().AromaticRings())`, which is not a method
        # RingInfo has; it raised AttributeError for every valid molecule.
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
    }
