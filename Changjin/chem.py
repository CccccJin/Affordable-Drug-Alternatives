from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem
from typing import Optional, Union
import numpy as np

def smiles_to_fingerprint(smiles: str, n_bits: int = 1024):
    """
    Generates a Morgan fingerprint from a SMILES string and returns it
    as an RDKit ExplicitBitVect object.
    """
    if not smiles:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if not mol:
        return None
    
    # This function specifically returns the ExplicitBitVect object we need
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=n_bits)
    return fp

def calculate_similarity(
    fp1: np.ndarray, 
    fp2: Union[np.ndarray, str], 
    metric: str = 'tanimoto'
) -> float:
    """
    Calculate similarity between two fingerprints.
    
    Args:
        fp1: First fingerprint (numpy array)
        fp2: Second fingerprint (numpy array or SMILES string)
        metric: Similarity metric ('tanimoto' or 'dice')
        
    Returns:
        Similarity score between 0 and 1
    """
    try:
        if isinstance(fp2, str):
            # If fp2 is a SMILES string, convert it to a fingerprint
            fp2 = smiles_to_fingerprint(fp2)
            if fp2 is None or fp2.size == 0:
                return 0.0
        
        if fp1 is None or fp2 is None or fp1.size == 0 or fp2.size == 0:
            return 0.0
        
        # Ensure both fingerprints are numpy boolean arrays
        fp1 = np.asarray(fp1, dtype=bool).flatten()
        fp2 = np.asarray(fp2, dtype=bool).flatten()
        
        # Ensure both fingerprints have the same length
        if len(fp1) != len(fp2):
            return 0.0
        
        # Calculate similarity based on the specified metric
        if metric.lower() == 'tanimoto':
            intersection = np.sum(fp1 & fp2)
            union = np.sum(fp1 | fp2)
            return float(intersection / union) if union > 0 else 0.0
        elif metric.lower() == 'dice':
            intersection = np.sum(fp1 & fp2)
            sum_fp1 = np.sum(fp1)
            sum_fp2 = np.sum(fp2)
            if sum_fp1 == 0 and sum_fp2 == 0:
                return 1.0  # Both fingerprints are all zeros
            return float((2.0 * intersection) / (sum_fp1 + sum_fp2)) if (sum_fp1 + sum_fp2) > 0 else 0.0
        else:
            raise ValueError(f"Unsupported similarity metric: {metric}")
    except Exception as e:
        print(f"Error calculating similarity: {str(e)}")
        return 0.0

def get_compound_properties(smiles: str) -> Optional[dict]:
    """
    Calculate various molecular properties for a given SMILES string.
    
    Args:
        smiles: Input SMILES string
        
    Returns:
        Dictionary containing molecular properties or None if conversion fails
    """
    mol = Chem.MolFromSmiles(smiles)
    if not mol:
        return None
    
    return {
        'mw': AllChem.CalcExactMolWt(mol),
        'logp': AllChem.CalcCrippenDescriptors(mol)[0],
        'hba': AllChem.CalcNumHBA(mol),
        'hbd': AllChem.CalcNumHBD(mol),
        'rotatable_bonds': AllChem.CalcNumRotatableBonds(mol),
        'heavy_atoms': mol.GetNumHeavyAtoms(),
        'aromatic_rings': len(mol.GetRingInfo().AromaticRings())
    }
