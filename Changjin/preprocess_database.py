# preprocess_database.py
import os  
import duckdb
from rdkit import Chem
from rdkit.Chem import AllChem

# --- Recommended path setup ---
# 1. Get the directory of this script
script_directory = os.path.dirname(os.path.abspath(__file__))

# 2. Use os.path.join to safely construct paths
# This joins the script directory with the following path parts robustly
DB_FILE = os.path.join(script_directory, "chembl_35", "chembl_35.duckdb")

print(f"Attempting to connect to database at: {DB_FILE}")  # Print path for debugging
# --- End path setup ---
TABLE_NAME = "compound_structures"  # Update to your actual table name if different

def smiles_to_fingerprint_hex(smiles: str, n_bits: int = 1024):
    """Compute fingerprint and return a storable hex string."""
    if not smiles: return None
    mol = Chem.MolFromSmiles(smiles)
    if not mol: return None
    
    # This is the old, deprecated function that exists in your RDKit version
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=n_bits)
    
    return fp.ToBitString().encode('utf-8').hex()
    
def run_preprocessing():
    con = duckdb.connect(DB_FILE)
    
    # 1. Ensure the fingerprint column exists; add it if missing
    try:
        con.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN fingerprint_hex VARCHAR;")
        print("Column 'fingerprint_hex' added.")
    except Exception as e:
        print(f"Could not add column (maybe it already exists?): {e}")

    # 2. Fetch all molecules that need processing
    # Note: only select rows where fingerprints are not yet computed
    rows_to_process = con.execute(
        f"SELECT molregno, canonical_smiles FROM {TABLE_NAME} WHERE canonical_smiles IS NOT NULL AND fingerprint_hex IS NULL"
    ).fetchall()
    
    total_rows = len(rows_to_process)
    print(f"Found {total_rows} molecules to process.")

    # 3. Compute and update fingerprints one by one
    for i, (molregno, smiles) in enumerate(rows_to_process):
        fp_hex = smiles_to_fingerprint_hex(smiles)
        if fp_hex:
            con.execute(f"UPDATE {TABLE_NAME} SET fingerprint_hex = ? WHERE molregno = ?", (fp_hex, molregno))
        
        if (i + 1) % 1000 == 0:  # Print progress every 1000 rows
            print(f"Processed {i + 1}/{total_rows}...")
            
    con.close()
    print("Database preprocessing complete.")

if __name__ == "__main__":
    run_preprocessing()