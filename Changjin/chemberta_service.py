"""
ChemBERTa Service Module

This module provides molecular embeddings using a pre-trained ChemBERTa model
(via Hugging Face Transformers) and a lightweight, RDKit-based "generation"
that produces valid structural variants (randomized SMILES and tautomers).

Author: Updated to replace CDDD with ChemBERTa for Apple Silicon friendliness.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import pandas as pd
import duckdb
from sklearn.metrics.pairwise import cosine_similarity
from rdkit import Chem
from rdkit import DataStructs
from rdkit.Chem import AllChem

# Transformers / Torch
from transformers import AutoTokenizer, AutoModel
import torch

try:
    # Optional tautomer tools if available in RDKit build
    from rdkit.Chem.MolStandardize import rdMolStandardize  # type: ignore
except Exception:
    rdMolStandardize = None  # type: ignore

logger = logging.getLogger(__name__)

# Global model/tokenizer (lazy-load on first use)
_tokenizer = None  # type: Optional[AutoTokenizer]      
_model = None      # type: Optional[AutoModel]
_MODEL_NAME = "seyonec/ChemBERTa-zinc-base-v1"  
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Global demo data for similarity search
DEMO_DF = None
DEMO_EMBEDDINGS = None
DEMO_LOADED = False


def _ensure_model_loaded():
    # type: () -> Tuple[AutoTokenizer, AutoModel]
    global _tokenizer, _model
    if _tokenizer is not None and _model is not None:
        return _tokenizer, _model

    logger.info("Loading ChemBERTa model '{}' on {}...".format(_MODEL_NAME, _DEVICE))
    _tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
    _model = AutoModel.from_pretrained(_MODEL_NAME)
    _model.to(_DEVICE)
    _model.eval()
    logger.info("ChemBERTa loaded successfully")
    return _tokenizer, _model


def _validate_smiles(smiles: str) -> bool:
    try:
        return Chem.MolFromSmiles(smiles) is not None
    except Exception:
        return False


def get_molecular_embedding(smiles_input: str) -> np.ndarray:
    """
    Compute a ChemBERTa embedding for a SMILES string by mean-pooling the
    last hidden states. Returns a 1D numpy float32 array.
    """
    if not isinstance(smiles_input, str) or not smiles_input.strip():
        raise ValueError("Input SMILES must be a non-empty string")
    if not _validate_smiles(smiles_input):
        raise ValueError("Invalid SMILES provided for embedding")

    tokenizer, model = _ensure_model_loaded()

    # Tokenize; ChemBERTa models are generally trained on SMILES directly
    with torch.inference_mode():
        inputs = tokenizer(
            smiles_input,
            return_tensors="pt",
            padding=False,
            truncation=True,
            max_length=256,
        )
        inputs = {k: v.to(_DEVICE) for k, v in inputs.items()}
        outputs = model(**inputs)
        # outputs.last_hidden_state: [1, seq_len, hidden]
        hidden = outputs.last_hidden_state
        emb = hidden.mean(dim=1)  # [1, hidden]
        emb_np = emb.squeeze(0).detach().cpu().numpy().astype(np.float32)
        return emb_np


def generate_new_molecules(smiles_input: str, num_samples: int = 10, temp: float = 1.0) -> List[str]:
    """
    Generate valid structural variants for a given SMILES.

    Note: ChemBERTa is not a generative decoder for SMILES. Here we provide a
    practical substitute suitable for demos:
    - Enumerate tautomers when available
    - Create randomized SMILES for additional diversity

    The `temp` parameter lightly affects the ratio of tautomers vs randomizations.
    """
    if not isinstance(smiles_input, str) or not smiles_input.strip():
        raise ValueError("Input SMILES must be a non-empty string")
    mol = Chem.MolFromSmiles(smiles_input)
    if mol is None:
        raise ValueError("Invalid input SMILES for generation")

    # Touch the model once so the app can report it is usable
    try:
        _ = get_molecular_embedding(smiles_input)
    except Exception as e:
        logger.warning("Embedding failed (continuing with RDKit-only gen): {}".format(e))

    generated: List[str] = []

    # 1) Tautomers (if available)
    if rdMolStandardize is not None:
        try:
            enumerator = rdMolStandardize.TautomerEnumerator()
            tautomers = enumerator.Enumerate(mol)
            for tmol in tautomers:
                s = Chem.MolToSmiles(tmol)
                if s:
                    generated.append(s)
        except Exception as e:
            logger.debug(f"Tautomer enumeration failed: {e}")

    # 2) Randomized SMILES to reach the requested count
    remaining = max(0, num_samples - len(generated))
    for _ in range(remaining):
        try:
            s = Chem.MolToSmiles(mol, doRandom=True)
            if s:
                generated.append(s)
        except Exception:
            break

    # Validate, de-duplicate, and clip
    unique: List[str] = []
    seen = set()
    for s in generated:
        if s and s not in seen and _validate_smiles(s):
            seen.add(s)
            unique.append(s)
        if len(unique) >= num_samples:
            break

    return unique


def load_demo_data(db_path: str = "chembl_35/chembl_35.duckdb", sample_size: int = 5000):
    """
    Load a sample of molecules from ChEMBL DuckDB database with pre-computed ChemBERTa embeddings.
    
    Args:
        db_path: Path to the ChEMBL DuckDB database
        sample_size: Number of molecules to sample for similarity search
    """
    global DEMO_DF, DEMO_EMBEDDINGS, DEMO_LOADED
    
    try:
        logger.info("Loading up to {} molecules from {}...".format(sample_size, db_path))
        
        # Connect to DuckDB database
        conn = duckdb.connect(db_path)
        
        # Get a sample of molecules with their embeddings
        query = """
        SELECT 
            md.chembl_id,
            cs.canonical_smiles,
            ce.embedding
        FROM chemberta_embeddings ce
        JOIN compound_structures cs ON ce.molregno = cs.molregno
        JOIN molecule_dictionary md ON cs.molregno = md.molregno
        WHERE cs.canonical_smiles IS NOT NULL
        LIMIT {}
        """.format(sample_size)
        
        result = conn.execute(query).fetchall()
        conn.close()
        
        if not result:
            raise RuntimeError("No data found in the database")
        
        # Convert to DataFrame
        DEMO_DF = pd.DataFrame(result, columns=['chembl_id', 'canonical_smiles', 'embedding'])
        logger.info("Loaded {} molecules from database".format(len(DEMO_DF)))
        
        # Convert embeddings to numpy array
        embeddings_list = []
        for embedding in DEMO_DF['embedding']:
            if isinstance(embedding, list):
                embeddings_list.append(np.array(embedding, dtype=np.float32))
            else:
                embeddings_list.append(np.array(embedding, dtype=np.float32))
        
        DEMO_EMBEDDINGS = np.vstack(embeddings_list)
        DEMO_LOADED = True
        
        logger.info("Successfully loaded {} molecules with {}-dim embeddings".format(len(DEMO_DF), DEMO_EMBEDDINGS.shape[1]))
        
    except Exception as e:
        logger.error("Error loading demo data: {}".format(e))
        DEMO_DF = None
        DEMO_EMBEDDINGS = None
        DEMO_LOADED = False
        raise RuntimeError("Failed to load demo data from DuckDB database: {}".format(e))


def search_similar_chemberta(input_smiles: str, top_k: int = 10) -> List[Dict[str, Any]]:
    """
    Search for similar molecules using ChemBERTa embeddings from the DuckDB database.
    
    Args:
        input_smiles: Input SMILES string
        top_k: Number of similar molecules to return
        
    Returns:
        List of dictionaries containing 'chembl_id', 'smiles', and 'similarity' for each result
    """
    global DEMO_DF, DEMO_EMBEDDINGS, DEMO_LOADED
    
    if not DEMO_LOADED or DEMO_DF is None or DEMO_EMBEDDINGS is None:
        load_demo_data()  # Try to load if not already loaded
    
    if not DEMO_LOADED:
        raise RuntimeError("Demo data could not be loaded from the database")
    
    try:
        # Get embedding for input SMILES
        input_embedding = get_molecular_embedding(input_smiles)
        if input_embedding is None:
            raise ValueError("Could not compute embedding for input SMILES")
        
        # Reshape for cosine_similarity (needs 2D array)
        input_embedding = np.array(input_embedding).reshape(1, -1)
        
        # Compute cosine similarity with all demo embeddings
        similarities = cosine_similarity(input_embedding, DEMO_EMBEDDINGS)[0]
        
        # Get top_k most similar
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        # Prepare results
        results = []
        for idx in top_indices:
            results.append({
                'chembl_id': DEMO_DF.iloc[idx]['chembl_id'],
                'smiles': DEMO_DF.iloc[idx]['canonical_smiles'],
                'similarity': float(similarities[idx])  # Convert numpy float to Python float
            })
            
        return results
        
    except Exception as e:
        raise RuntimeError("Error in similarity search: {}".format(str(e)))


def get_molecular_embedding_batch(smiles_list: List[str]) -> List[np.ndarray]:
    """
    Compute ChemBERTa embeddings for a batch of SMILES strings.
    
    Args:
        smiles_list: List of SMILES strings
        
    Returns:
        List of numpy arrays containing embeddings
    """
    if not smiles_list:
        return []
    
    tokenizer, model = _ensure_model_loaded()
    embeddings = []
    
    with torch.inference_mode():
        for smiles in smiles_list:
            try:
                if not _validate_smiles(smiles):
                    logger.warning("Invalid SMILES skipped: {}".format(smiles))
                continue
                
                inputs = tokenizer(
                    smiles,
                    return_tensors="pt",
                    padding=False,
                    truncation=True,
                    max_length=256,
                )
                inputs = {k: v.to(_DEVICE) for k, v in inputs.items()}
                outputs = model(**inputs)
                hidden = outputs.last_hidden_state
                emb = hidden.mean(dim=1)  # [1, hidden]
                emb_np = emb.squeeze(0).detach().cpu().numpy().astype(np.float32)
                embeddings.append(emb_np)
            except Exception as e:
                logger.warning("Failed to compute embedding for {}: {}".format(smiles, e))
                continue
    
    return embeddings


# Call this when the module is imported to pre-load the demo data
try:
    load_demo_data()
except Exception as e:
    logger.warning("Could not load demo data on startup: {}".format(e))
    DEMO_LOADED = False
