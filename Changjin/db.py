# app/core/db.py
import duckdb

DB_PATH = 'chembl_35/chembl_35.duckdb'

def get_db_connection():
    return duckdb.connect(database=DB_PATH, read_only=True)