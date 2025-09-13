# check_schema.py
import duckdb

DB_PATH = 'chembl_35/chembl_35.duckdb'

def check_table_columns(table_name):
    try:
        con = duckdb.connect(database=DB_PATH, read_only=True)
        print(f"--- Schema for table: {table_name} ---")
        # DESCRIBE is an SQL command used to show the structure of a table
        columns = con.execute(f"DESCRIBE {table_name};").fetchall()
        
        has_fingerprint = False
        for col in columns:
            print(f"Column Name: {col[0]}, Type: {col[1]}")
            if col[0].lower() == 'fingerprint_hex':
                has_fingerprint = True
        
        print("---")
        if has_fingerprint:
            print("✅ Good news! The 'fingerprint_hex' column already exists.")
        else:
            print("❌ As expected, the 'fingerprint_hex' column does NOT exist. You need to run the preprocessing script.")
        
        con.close()
    except Exception as e:
        print(f"An error occurred. Does the table '{table_name}' exist? Error: {e}")

def list_tables():
    """If you are not sure about the table name, list all tables first."""
    try:
        con = duckdb.connect(database=DB_PATH, read_only=True)
        print("--- Tables in the database ---")
        tables = con.execute("SHOW TABLES;").fetchall()
        for table in tables:
            print(table[0])
        con.close()
    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    # If you are not sure what your table name is, run list_tables() first
    print("Listing all tables first to find the correct one...")
    list_tables()
    
    # --- !! Put the correct table name from the list above here !! ---
    # It's likely called 'compound_structures' or something similar
    target_table = "compound_structures" 
    print(f"\nNow checking the schema for table '{target_table}'...")
    check_table_columns(target_table)