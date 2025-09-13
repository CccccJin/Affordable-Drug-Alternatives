"""
Dependencies:
- duckdb
- pandas
- torch
- transformers
- tqdm
- rdkit (optional, for SMILES validation)

Script: preprocess_chemberta.py
Purpose: Read molecules from a DuckDB database, compute ChemBERTa embeddings in
batches, and write them back into a new table in the same database as FLOAT[]
arrays.
"""

import os
from typing import List, Optional, Tuple

import duckdb
import pandas as pd
from tqdm import tqdm

# Optional RDKit for SMILES validation
try:
    from rdkit import Chem  # type: ignore
    _HAS_RDKIT = True
except Exception:
    Chem = None  # type: ignore
    _HAS_RDKIT = False

# Transformers / Torch
try:
    import torch  # type: ignore
    from transformers import AutoTokenizer, AutoModel  # type: ignore
    _HAS_TRANSFORMERS = True
except Exception:
    torch = None  # type: ignore
    AutoTokenizer = None  # type: ignore
    AutoModel = None  # type: ignore
    _HAS_TRANSFORMERS = False

# ---------------- Configuration ----------------
MODEL_NAME = "seyonec/ChemBERTa-zinc-base-v1"
BATCH_SIZE = 64
MAX_SEQ_LEN = 256

# Database path: align with other project scripts
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "chembl_35", "chembl_35.duckdb")
SOURCE_TABLE = "compound_structures"  # columns: molregno (INT), canonical_smiles (TEXT)
TARGET_TABLE = "chemberta_embeddings"  # columns to create: molregno (INT), embedding (FLOAT[])
# ------------------------------------------------


def get_device() -> str:
    """Choose the best available device (cuda > mps > cpu)."""
    if not _HAS_TRANSFORMERS or torch is None:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    # Apple Silicon MPS (PyTorch >= 1.12 with mps build)
    try:
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def load_chemberta(model_name: str, device: str):
    """Load tokenizer and model on the specified device."""
    if not _HAS_TRANSFORMERS:
        raise RuntimeError(
            "Transformers/Torch not available. Please `pip install transformers torch` to run this script."
        )
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name)
    model.to(device)
    model.eval()
    return tokenizer, model


def is_valid_smiles(smiles: Optional[str]) -> bool:
    if not smiles or not isinstance(smiles, str):
        return False
    if _HAS_RDKIT and Chem is not None:
        try:
            return Chem.MolFromSmiles(smiles) is not None
        except Exception:
            return False
    # Without RDKit, accept non-empty strings
    return True


def mean_pool_last_hidden(last_hidden_state, attention_mask):
    """Masked mean pooling over token dimension.
    last_hidden_state: [B, T, H]
    attention_mask:    [B, T]
    Returns: [B, H]
    """
    # Expand mask to match hidden size for correct broadcasting
    mask = attention_mask.unsqueeze(-1).type_as(last_hidden_state)  # [B, T, 1]
    masked = last_hidden_state * mask  # zero out paddings
    sum_hidden = masked.sum(dim=1)  # [B, H]
    lengths = mask.sum(dim=1).clamp(min=1e-9)  # [B, 1]
    return sum_hidden / lengths


def compute_embeddings(
    smiles_list: List[str], tokenizer, model, device: str
) -> List[List[float]]:
    """Tokenize a batch of SMILES and compute mean-pooled embeddings.
    Returns a list of Python lists (float) for each input.
    """
    if len(smiles_list) == 0:
        return []
    # Tokenize as a batch
    with torch.no_grad():
        inputs = tokenizer(
            smiles_list,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=MAX_SEQ_LEN,
        )
        # Move to device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        outputs = model(**inputs)
        hidden = outputs.last_hidden_state  # [B, T, H]
        pooled = mean_pool_last_hidden(hidden, inputs.get("attention_mask"))  # [B, H]
        # Convert to Python lists
        emb = pooled.detach().cpu().numpy()
        return [row.tolist() for row in emb]


def read_source_dataframe(con) -> pd.DataFrame:
    """Read molregno and canonical_smiles from the source table into a DataFrame."""
    # Use DuckDB to pull into pandas efficiently
    query = f"""
        SELECT molregno, canonical_smiles
        FROM {SOURCE_TABLE}
        WHERE canonical_smiles IS NOT NULL
    """
    df = con.execute(query).fetchdf()
    # Ensure expected dtypes
    if "molregno" in df.columns:
        df["molregno"] = pd.to_numeric(df["molregno"], errors="coerce").astype("Int64")
    return df


def initialize_target_table(con) -> None:
    """Ensure the target table exists with the expected schema. Do NOT drop existing data."""
    con.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {TARGET_TABLE} (
            molregno INTEGER,
            embedding FLOAT[]
        )
        """
    )


def get_processed_ids(con) -> set:
    """Return a set of molregno values already present in the target table.
    If the table does not exist yet, returns an empty set.
    """
    try:
        rows = con.execute(f"SELECT molregno FROM {TARGET_TABLE}").fetchall()
        return set(int(r[0]) for r in rows if r and r[0] is not None)
    except duckdb.CatalogException:
        # Table not found yet
        return set()


def append_batch_to_db(con, batch_rows: List[Tuple[int, List[float]]]) -> None:
    """Append a small batch of (molregno, embedding) rows into the target table.
    This function additionally guards against duplicates by anti-joining existing IDs.
    """
    if not batch_rows:
        return
    batch_df = pd.DataFrame(batch_rows, columns=["molregno", "embedding"])  # type: ignore
    con.register("batch_df", batch_df)
    # Insert only rows whose molregno is not already present (NOT EXISTS safety)
    try:
        con.execute(
            f"""
            INSERT INTO {TARGET_TABLE}
            SELECT CAST(b.molregno AS INTEGER) AS molregno, b.embedding::FLOAT[] AS embedding
            FROM batch_df b
            WHERE NOT EXISTS (
                SELECT 1 FROM {TARGET_TABLE} t WHERE t.molregno = b.molregno
            )
            """
        )
    except Exception as e:
        # If an error occurs, log and continue; script is resumable
        print(f"Warning: failed to append batch ({len(batch_rows)} rows): {e}")
    # Unregister temp view
    con.unregister("batch_df")


def main() -> None:
    print("Connecting to DuckDB at:", DB_PATH)
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError("DuckDB database file not found: {}".format(DB_PATH))

    device = get_device()
    print("Selected device:", device)

    tokenizer = None
    model = None
    if _HAS_TRANSFORMERS:
        tokenizer, model = load_chemberta(MODEL_NAME, device)
        print("ChemBERTa model loaded:", MODEL_NAME)
    else:
        raise RuntimeError(
            "Transformers/Torch not available. Please install them to compute ChemBERTa embeddings."
        )

    # Open database connection
    con = duckdb.connect(DB_PATH)
    try:
        # 1) Ensure target table exists (no dropping)
        initialize_target_table(con)

        # 2) Determine already processed IDs for resumability
        processed_ids = get_processed_ids(con)
        print("Already processed molecules:", len(processed_ids))

        # 3) Read source data into pandas
        df = read_source_dataframe(con)
        print("Total molecules loaded:", len(df))

        # 4) Filter out already-processed entries immediately
        if len(processed_ids) > 0:
            df = df[~df["molregno"].isin(processed_ids)]
        print("Remaining to process:", len(df))

        # Prepare iteration in batches (no global accumulation)
        smiles_buffer: List[str] = []
        ids_buffer: List[int] = []

        # 5) Filter invalid upfront to avoid model errors
        valid_rows = []
        for idx, row in df.iterrows():
            molregno = row["molregno"]
            smiles = row["canonical_smiles"]
            if pd.isna(molregno) or molregno is None:
                continue
            if is_valid_smiles(smiles):
                valid_rows.append((int(molregno), smiles))
        total_valid = len(valid_rows)
        print("Total valid molecules:", total_valid)

        # 6) Process in batches with progress bar and append after each batch
        for i in tqdm(range(0, total_valid, BATCH_SIZE), desc="Embedding batches"):
            batch = valid_rows[i : i + BATCH_SIZE]
            ids_buffer = [mr for (mr, _) in batch]
            smiles_buffer = [s for (_, s) in batch]

            try:
                batch_emb = compute_embeddings(smiles_buffer, tokenizer, model, device)
            except Exception as e:
                # If a rare batch issue occurs, fall back to per-item to salvage what we can
                batch_emb = []
                for mr, s in batch:
                    try:
                        emb_single = compute_embeddings([s], tokenizer, model, device)
                        batch_emb.extend(emb_single)
                    except Exception:
                        # skip this one
                        pass
            # Pair IDs with embeddings and append this small batch immediately
            batch_rows: List[Tuple[int, List[float]]] = [
                (mr, emb) for mr, emb in zip(ids_buffer, batch_emb)
            ]
            append_batch_to_db(con, batch_rows)
        print("All remaining embeddings computed and appended.")
    finally:
        con.close()
        print("Database connection closed.")


if __name__ == "__main__":
    main()
