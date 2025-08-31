# view_results.py
import os
import duckdb

# --- 确保路径正确 ---
script_directory = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(script_directory, "chembl_35", "chembl_35.duckdb")
TABLE_NAME = "compound_structures"
# ---------------------

def view_first_n_rows(n=414214321321):
    """连接到数据库并打印前n行的数据，包括新的指纹列"""
    if not os.path.exists(DB_FILE):
        print(f"Error: Database file not found at {DB_FILE}")
        return

    print(f"--- Viewing first {n} rows from '{TABLE_NAME}' with fingerprints ---")
    con = duckdb.connect(database=DB_FILE, read_only=True)

    # 选择SMILES和新的指纹列，只看前n行
    try:
        results = con.execute(
            f"SELECT canonical_smiles, fingerprint_hex FROM {TABLE_NAME} WHERE fingerprint_hex IS NOT NULL LIMIT {n}"
        ).fetchall()

        if not results:
            print("No rows found with fingerprints. Did the preprocessing run correctly?")
            return

        for i, row in enumerate(results):
            smiles, fingerprint = row
            # 为了方便显示，只截取指纹的前40个字符
            fingerprint_preview = (fingerprint[:40] + '...') if fingerprint else "None"

            print(f"\n--- Row {i+1} ---")
            print(f"  SMILES: {smiles}")
            print(f"  Fingerprint: {fingerprint_preview}")

    except duckdb.CatalogException as e:
        print(f"\nAn error occurred. Does the column 'fingerprint_hex' exist? Error: {e}")
    finally:
        con.close()

if __name__ == "__main__":
    view_first_n_rows()