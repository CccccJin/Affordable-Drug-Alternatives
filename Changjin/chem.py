# app/core/chem.py
from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem

def smiles_to_fingerprint(smiles: str, n_bits: int = 1024):
    mol = Chem.MolFromSmiles(smiles)
    if not mol:
        return None
    return AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=n_bits)

def calculate_similarity(fp1, fp2_hex: str):
    fp2 = DataStructs.CreateFromBitString(bytes.fromhex(fp2_hex).decode('utf-8'))
    return DataStructs.TanimotoSimilarity(fp1, fp2)
