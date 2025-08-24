import duckdb

# Make sure this path is the same one your import script created
DUCKDB_FILE = 'chembl_35/chembl_35.duckdb' 

try:
    con = duckdb.connect(DUCKDB_FILE, read_only=True)
    print(f"✅ Successfully connected to {DUCKDB_FILE}")
    print("\nTables found in the database:")
    
    # The 'SHOW TABLES' command lists all tables
    tables = con.execute("SHOW TABLES;").fetchall()
    
    found = False
    for table in tables:
        print(f"- {table[0]}")
        if table[0] == 'compounds':
            found = True
            
    print("-" * 30)
    if found:
        print("✅ SUCCESS: The 'compounds' table was found!")
    else:
        print("❌ FAILED: The 'compounds' table is MISSING!")
        
    con.close()

except Exception as e:
    print(f"An error occurred: {e}")