import duckdb
import sys

def check_database():
    db_path = 'chembl_35/chembl_35.duckdb'
    print(f"Checking database at: {db_path}")
    
    try:
        # Connect to the database
        conn = duckdb.connect(db_path)
        print("✓ Successfully connected to the database")
        
        # Check if compound_structures table exists
        tables = conn.execute("SHOW TABLES").fetchall()
        table_names = [t[0] for t in tables]
        print(f"\nFound {len(table_names)} tables in the database")
        
        if 'compound_structures' not in table_names:
            print("\n❌ Error: 'compound_structures' table not found in the database")
            return False
            
        print("\nChecking 'compound_structures' table structure:")
        columns = conn.execute("PRAGMA table_info(compound_structures)").fetchall()
        print("\nColumns in 'compound_structures' table:")
        for col in columns:
            print(f"- {col[1]} ({col[2]})")
            
        # Check if compound_properties table exists
        if 'compound_properties' not in table_names:
            print("\n❌ Error: 'compound_properties' table not found in the database")
            return False
            
        print("\nChecking 'compound_properties' table structure:")
        columns = conn.execute("PRAGMA table_info(compound_properties)").fetchall()
        print("\nColumns in 'compound_properties' table:")
        for col in columns:
            print(f"- {col[1]} ({col[2]})")
        
        # Check sample data
        print("\nSample data from 'compound_structures' (first 3 rows):")
        sample = conn.execute("""
            SELECT cs.molregno, cs.molecule_chembl_id, cs.canonical_smiles
            FROM compound_structures cs
            LIMIT 3
        """).fetchall()
        
        for row in sample:
            print(f"- {row}")
            
        # Check if we can join with compound_properties
        print("\nTesting join with 'compound_properties' (first 3 rows):")
        sample = conn.execute("""
            SELECT cs.molecule_chembl_id, cs.canonical_smiles, 
                   cp.mw_freebase, cp.alogp, cp.hba, cp.hbd
            FROM compound_structures cs
            JOIN compound_properties cp ON cs.molregno = cp.molregno
            LIMIT 3
        """).fetchall()
        
        for row in sample:
            print(f"- {row}")
            
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    success = check_database()
    sys.exit(0 if success else 1)
