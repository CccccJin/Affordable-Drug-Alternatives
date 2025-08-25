import duckdb

# Connect to the database
conn = duckdb.connect('chembl_35/chembl_35.duckdb')

# Get column info for compound_structures table
columns = conn.execute("PRAGMA table_info(compound_structures)").fetchall()
print("Columns in compound_structures table:")
for col in columns:
    print(f"- {col[1]} ({col[2]})")

# Check if we have the columns we need
needed_columns = ['molecule_chembl_id', 'canonical_smiles', 'standard_inchi']
print("\nChecking for required columns:")
for col in needed_columns:
    if col in [c[1] for c in columns]:
        print(f"✓ Found column: {col}")
    else:
        print(f"✗ Missing column: {col}")

conn.close()
