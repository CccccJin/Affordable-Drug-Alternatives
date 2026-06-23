# app/core/db.py
import duckdb
import os

DB_PATH = os.getenv('CHEMBL_DUCKDB_PATH', '/Users/hehahahaha/Desktop/PostgraduateResearch/8.Cloudcell/Affordable/prj.internship_202507/Changjin/chembl_35/chembl_35.duckdb')

def get_db_connection():
    return duckdb.connect(database=DB_PATH, read_only=True)