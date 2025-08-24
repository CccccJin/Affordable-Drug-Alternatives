import duckdb
import sqlite3
import os
import time
from tqdm import tqdm

# --- Configuration ---
SQLITE_FILE = os.path.join('chembl_35', 'chembl_35.db')  # Input file path
DUCKDB_FILE = os.path.join('chembl_35', 'chembl_35.duckdb')  # Output file path
BATCH_SIZE = 10000  # Number of rows to process at once

# --- Helper Functions ---
def get_table_row_count(con, schema, table_name):
    """Get the number of rows in a table."""
    try:
        result = con.execute(f"SELECT COUNT(*) FROM {schema}.{table_name}").fetchone()
        return result[0] if result else 0
    except Exception as e:
        print(f"  Warning: Could not get row count for {table_name}: {str(e)}")
        return 0

def import_table(sqlite_conn, duckdb_conn, table_name):
    """Import a single table from SQLite to DuckDB."""
    try:
        # Get the table structure from SQLite
        cursor = sqlite_conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        
        # Create column definitions
        column_defs = []
        for col in columns:
            col_name = col[1]
            col_type = col[2].upper()
            # Map SQLite types to DuckDB types
            if 'INT' in col_type:
                col_type = 'BIGINT'
            elif 'TEXT' in col_type or 'CHAR' in col_type:
                col_type = 'VARCHAR'
            elif 'REAL' in col_type or 'FLOA' in col_type or 'DOUB' in col_type:
                col_type = 'DOUBLE'
            elif 'BLOB' in col_type:
                col_type = 'BLOB'
            else:
                col_type = 'VARCHAR'  # Default to VARCHAR for unknown types
            column_defs.append(f'"{col_name}" {col_type}')
        
        # Create the table in DuckDB
        duckdb_conn.execute(f"CREATE TABLE {table_name} ({', '.join(column_defs)});")
        
        # Get total rows for progress tracking
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        total_rows = cursor.fetchone()[0]
        print(f"  Importing {total_rows:,} rows...")
        
        # Get column names for insert statement
        cursor.execute(f"SELECT * FROM {table_name} LIMIT 0")
        column_names = [desc[0] for desc in cursor.description]
        columns_str = ', '.join([f'"{name}"' for name in column_names])
        placeholders = ', '.join(['?'] * len(column_names))
        
        # Import data in batches
        offset = 0
        with tqdm(total=total_rows, desc=f"  Progress", unit="rows") as pbar:
            while True:
                # Read batch from SQLite
                cursor.execute(
                    f"SELECT * FROM {table_name} "
                    f"LIMIT {BATCH_SIZE} OFFSET {offset}"
                )
                batch = cursor.fetchall()
                
                if not batch:
                    break
                
                # Insert batch into DuckDB
                if batch:
                    duckdb_conn.executemany(
                        f"INSERT INTO {table_name} ({columns_str}) VALUES ({placeholders})",
                        batch
                    )
                
                offset += len(batch)
                pbar.update(len(batch))
        
        # Add any indexes if needed
        # Example: con.execute(f"CREATE INDEX idx_{table_name}_id ON {table_name}(id);")
        
        return True, ""
        
    except Exception as e:
        return False, str(e)

# --- Main Execution ---
def main():
    print(f"Importing SQLite database '{SQLITE_FILE}' into DuckDB file '{DUCKDB_FILE}'...")
    
    # Check if SQLite database exists
    if not os.path.exists(SQLITE_FILE):
        print(f"Error: SQLite database not found at {SQLITE_FILE}")
        return
    
    # Remove existing DuckDB file if it exists
    if os.path.exists(DUCKDB_FILE):
        os.remove(DUCKDB_FILE)
    
    # Connect to SQLite
    sqlite_conn = sqlite3.connect(SQLITE_FILE)
    
    # Connect to DuckDB
    duckdb_conn = duckdb.connect(DUCKDB_FILE)
    
    try:
        # Get list of tables from SQLite
        cursor = sqlite_conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        # Filter out system tables
        tables = [t for t in tables if not t[0].startswith('sqlite_')]
        print(f"Found {len(tables)} tables in SQLite database.")
        
        print(f"Found {len(tables)} tables. Starting import...")
        
        # Import each table
        for i, (table_name,) in enumerate(tables, 1):
            print(f"\n[{i}/{len(tables)}] Importing table: {table_name}")
            start_time = time.time()
            
            try:
                success, error = import_table(sqlite_conn, duckdb_conn, table_name)
                
                if success:
                    # Get row count from DuckDB
                    result = duckdb_conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                    row_count = result[0] if result else 0
                    print(f"  ✓ Successfully imported {row_count:,} rows in {time.time() - start_time:.2f}s")
                else:
                    print(f"  ✗ Failed to import {table_name}: {error}")
            except Exception as e:
                print(f"  ✗ Error importing {table_name}: {str(e)}")
        
        print("\nAll tables processed!")
        
    finally:
        # Clean up
        if 'sqlite_conn' in locals():
            sqlite_conn.close()
        if 'duckdb_conn' in locals():
            duckdb_conn.close()
    
    print(f"\n✅ Database successfully created at: {DUCKDB_FILE}")
    print("You can now run the FastAPI application with: uvicorn main:app --reload")

if __name__ == "__main__":
    main()