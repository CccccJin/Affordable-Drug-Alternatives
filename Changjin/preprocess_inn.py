#!/usr/bin/env python3
"""
Prepare chembl_35.duckdb with INN information extracted from chembl_35.db (SQLite).
Supports batch processing + resume on next run.
"""

import sqlite3
import duckdb
import pandas as pd
import logging
import os

# ========== 配置 ==========
SQLITE_DB_PATH = "chembl_35/chembl_35.db"     # ChEMBL 官方 SQLite
DUCKDB_PATH   = "chembl_35/chembl_35.duckdb"  # 目标 DuckDB
BATCH_SIZE    = 50000                         # 每次批量处理行数

# ========== 日志 ==========
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ========== 初始化 DuckDB ==========
def init_duckdb(duckdb_path: str):
    conn = duckdb.connect(duckdb_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS inn_list (
            chembl_id VARCHAR,
            INN VARCHAR,
            molregno INTEGER,
            PRIMARY KEY (molregno, INN)
        )
    """)
    return conn

# ========== 获取 SQLite 最大 molregno ==========
def get_max_molregno(sqlite_path: str) -> int:
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()
    cur.execute("SELECT MAX(molregno) FROM molecule_synonyms WHERE syn_type = 'INN'")
    max_val = cur.fetchone()[0]
    conn.close()
    return max_val

# ========== 处理单批 ==========
def process_batch(sqlite_path: str, start: int, end: int) -> pd.DataFrame:
    conn = sqlite3.connect(sqlite_path)
    query = f"""
        SELECT m.chembl_id, s.synonyms AS INN, s.molregno
        FROM molecule_dictionary m
        JOIN molecule_synonyms s ON m.molregno = s.molregno
        WHERE s.syn_type = 'INN'
        AND s.molregno BETWEEN {start} AND {end}
        AND s.synonyms IS NOT NULL
        AND LENGTH(TRIM(s.synonyms)) > 0
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    return df

# ========== 主流程 ==========
def preprocess_inn(sqlite_path: str, duckdb_path: str, batch_size: int = 50000):
    max_val = get_max_molregno(sqlite_path)
    logging.info(f"SQLite INN 最大 molregno: {max_val}")

    conn = init_duckdb(duckdb_path)

    # 查找已处理的最大 molregno
    try:
        last_done = conn.execute("SELECT MAX(molregno) FROM inn_list").fetchone()[0]
        if last_done is None:
            last_done = 0
    except:
        last_done = 0
    logging.info(f"已处理到 molregno={last_done}")

    # 从 last_done+1 开始
    start = last_done + 1
    while start <= max_val:
        end = min(start + batch_size - 1, max_val)
        logging.info(f"处理 batch: molregno {start} → {end}")

        df = process_batch(sqlite_path, start, end)
        if not df.empty:
            conn.register("df_view", df)
            conn.execute("""
                INSERT OR REPLACE INTO inn_list
                SELECT * FROM df_view
            """)
            conn.commit()
            logging.info(f"插入 {len(df)} 行")
        else:
            logging.info("本批无数据")

        start = end + 1

    conn.close()
    logging.info("✅ INN 提取完成（支持断点续跑）")

# ========== 入口 ==========
if __name__ == "__main__":
    preprocess_inn(SQLITE_DB_PATH, DUCKDB_PATH, BATCH_SIZE)
