# Part A: create_demo_data.py
"""
Create a demo dataset of ChemBERTa embeddings from a sample of ChEMBL molecules.
Saves results to a Parquet file for efficient loading in the demo.

Dependencies:
- duckdb
- pandas
- torch
- transformers
- tqdm
- pyarrow (for Parquet support)
- numpy
- scikit-learn (for cosine_similarity)
"""

import os
import random
from typing import List, Tuple

import duckdb
import numpy as np
import pandas as pd
import torch
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModel

# Configuration
DB_PATH = "chembl_35/chembl_35.duckdb"  # Path to DuckDB database
SAMPLE_SIZE = 5000                      # Number of molecules to sample
OUTPUT_PATH = "chemberta_demo_data.parquet"  # Output file
MODEL_NAME = "seyonec/ChemBERTa-zinc-base-v1"  # Pre-trained model
BATCH_SIZE = 64                         # Batch size for inference
RANDOM_SEED = 42                        # For reproducibility

def get_device() -> str:
    """Get the best available device (CUDA > MPS > CPU)."""
    if torch.cuda.is_available():
        return "cuda"
    try:
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"

def load_sample_molecules(db_path: str, sample_size: int) -> pd.DataFrame:
    """Load a random sample of molecules from the database."""
    print(f"Loading {sample_size} random molecules from {db_path}...")
    con = duckdb.connect(db_path)
    try:
        query = f"""
        SELECT molregno, canonical_smiles
        FROM compound_structures
        WHERE canonical_smiles IS NOT NULL
        ORDER BY RANDOM()
        LIMIT {sample_size}
        """
        df = con.execute(query).fetchdf()
        print(f"Loaded {len(df)} molecules")
        return df
    finally:
        con.close()

def compute_embeddings(smiles_list: List[str], model, tokenizer, device: str) -> np.ndarray:
    """Compute ChemBERTa embeddings for a list of SMILES strings."""
    embeddings = []
    model.eval()
    
    with torch.no_grad():
        for i in tqdm(range(0, len(smiles_list), BATCH_SIZE), 
                     desc="Computing embeddings", unit="batch"):
            batch = smiles_list[i:i+BATCH_SIZE]
            inputs = tokenizer(
                batch,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=256,
            ).to(device)
            
            outputs = model(**inputs)
            # Mean pool the hidden states
            last_hidden = outputs.last_hidden_state
            attention_mask = inputs.attention_mask.unsqueeze(-1)
            mean_pooled = (last_hidden * attention_mask).sum(dim=1) / attention_mask.sum(dim=1)
            embeddings.append(mean_pooled.cpu().numpy())
    
    return np.vstack(embeddings)

def main():
    # Set random seed for reproducibility
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)
    torch.manual_seed(RANDOM_SEED)
    
    # Get device
    device = get_device()
    print(f"Using device: {device}")
    
    # Load sample molecules
    df = load_sample_molecules(DB_PATH, SAMPLE_SIZE)
    
    # Load model and tokenizer
    print(f"Loading model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModel.from_pretrained(MODEL_NAME).to(device)
    
    # Compute embeddings
    print("Computing embeddings...")
    embeddings = compute_embeddings(df['canonical_smiles'].tolist(), model, tokenizer, device)
    
    # Add embeddings to dataframe
    df['embedding'] = list(embeddings)
    
    # Save to parquet
    print(f"Saving to {OUTPUT_PATH}...")
    df.to_parquet(OUTPUT_PATH, index=False)
    print("Done!")

if __name__ == "__main__":
    main()