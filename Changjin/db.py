# app/core/db.py
import duckdb

DB_PATH = 'chembl_data.duckdb'

def get_db_connection():
    # 以只读模式连接，对 API 更安全
    return duckdb.connect(database=DB_PATH, read_only=True)