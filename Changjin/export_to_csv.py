import os
import duckdb
import csv
from typing import Optional

# --- Configuration ---
# Ensure this path matches your project structure
DB_FILE = os.path.join("chembl_35", "chembl_35.duckdb")
OUTPUT_CSV_FILE = "chembl_export.csv"
ROW_LIMIT = None  # Set a row limit to export. Use None to export all rows.

def export_data_to_csv(limit: Optional[int] = ROW_LIMIT):
    """
    Connect to the ChEMBL DuckDB database, query molecule information,
    and export the results to a CSV file.
    """
    if not os.path.exists(DB_FILE):
        print(f"Error: Database file not found. Please check path: {DB_FILE}")
        return

    # 1) Build the SQL query
    # - JOIN three key tables: molecule_dictionary, compound_structures, molecule_synonyms
    # - Use LEFT JOIN so molecules without synonyms are still included
    # - Use string_agg to combine multiple synonyms separated by semicolons
    # - GROUP BY each molecule to aggregate its synonyms
    sql_query = """
    SELECT
        md.chembl_id,
        cs.canonical_smiles,
        string_agg(ms.synonyms, ';') AS molecule_synonyms
    FROM
        molecule_dictionary AS md
    JOIN
        compound_structures AS cs ON md.molregno = cs.molregno
    LEFT JOIN
        molecule_synonyms AS ms ON md.molregno = ms.molregno
    WHERE
        cs.canonical_smiles IS NOT NULL
    GROUP BY
        md.chembl_id,
        cs.canonical_smiles
    ORDER BY
        md.chembl_id
    """

    if limit is not None:
        sql_query += f" LIMIT {limit}"

    print(f"Preparing to connect to database: {DB_FILE}")
    con = duckdb.connect(database=DB_FILE, read_only=True)
    
    print("Executing SQL query... (may take some time for large datasets)")
    results = con.execute(sql_query).fetchall()
    con.close()
    
    if not results:
        print("The query returned no results.")
        return

    print(f"Query finished. Retrieved {len(results)} records.")
    print(f"Writing to file: {OUTPUT_CSV_FILE}")

    # 2) Write to CSV using the csv module to handle special chars and commas
    try:
        with open(OUTPUT_CSV_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            # Header
            writer.writerow(['molecule_chembl_id', 'canonical_smiles', 'molecule_synonyms'])
            
            # Rows
            writer.writerows(results)
            
        print(f"\n✅ Success! Data exported to {OUTPUT_CSV_FILE}")
    except IOError as e:
        print(f"\n❌ Failed: Error writing file: {e}")


if __name__ == "__main__":
    export_data_to_csv()