import duckdb
import os

# --- Configuration ---
SQLITE_FILE = os.path.join('chembl_35', 'chembl_35.db') # Input file path
DUCKDB_FILE = os.path.join('chembl_35', 'chembl_35.duckdb') # Output file path

# --- Start conversion ---
print(f"Importing SQLite database '{SQLITE_FILE}' into DuckDB file '{DUCKDB_FILE}'...")

# 1. Connect to a new (or existing) DuckDB file
# If the file exists, remove it first to ensure a clean import
if os.path.exists(DUCKDB_FILE):
    os.remove(DUCKDB_FILE)
con = duckdb.connect(DUCKDB_FILE)

# 2. Install and load the SQLite extension
con.execute("INSTALL sqlite;")
con.execute("LOAD sqlite;")

# 3. Attach the SQLite database to the current connection
con.execute(f"ATTACH '{SQLITE_FILE}' AS chembl_sqlite (TYPE SQLITE);")
print("SQLite database attached successfully.")

# Corrected line
tables = con.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'chembl_sqlite';").fetchall()
print(f"Found {len(tables)} tables. Starting import...")

# 5. Iterate over all tables and copy them into DuckDB
for i, table_tuple in enumerate(tables):
    table_name = table_tuple[0]
    print(f"({i+1}/{len(tables)}) Importing table: {table_name} ...")
    
    # Use CREATE TABLE AS SELECT * FROM ... for a full copy
    # This is the most efficient approach
    create_table_sql = f"CREATE TABLE {table_name} AS SELECT * FROM chembl_sqlite.{table_name};"
    con.execute(create_table_sql)

# 6. Close the connection
con.close()

print("\nAll data imported successfully!")
print(f"You now have a high-performance DuckDB database file: '{DUCKDB_FILE}'")