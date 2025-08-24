# app/core/chem.py
from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem

def smiles_to_fingerprint(smiles: str, n_bits: int = 1024):
    mol = Chem.MolFromSmiles(smiles)
    if not mol:
        return None
    return AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=n_bits)

def calculate_similarity(fp1, fp2_hex_or_bits: str):
    """
    Recreate a fingerprint from either:
    - hex-encoded RDKit binary text (DataStructs.BitVectToBinaryText(fp).hex())
    - or a raw bit string (fp.ToBitString())
    and compute Tanimoto similarity.
    """
    # Try hex -> binary-text route first (most compact for storage)
    try:
        binary = bytes.fromhex(fp2_hex_or_bits)
        fp2 = DataStructs.CreateFromBinaryText(binary)
    except ValueError:
        # Fallback: assume it's a raw bit string of '0'/'1'
        fp2 = DataStructs.CreateFromBitString(fp2_hex_or_bits)
    return DataStructs.TanimotoSimilarity(fp1, fp2)
