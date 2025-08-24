import duckdb
import os

# --- 配置 ---
SQLITE_FILE = os.path.join('chembl_35', 'chembl_35.db') # 输入文件路径
DUCKDB_FILE = os.path.join('chembl_35', 'chembl_35.duckdb') # 输出文件路径

# --- 开始转换 ---
print(f"正在将 SQLite 数据库 '{SQLITE_FILE}' 导入到 DuckDB 原生文件 '{DUCKDB_FILE}'...")

# 1. 连接到一个新的（或已存在的）DuckDB 文件
# 如果文件已存在，先删除，确保全新导入
if os.path.exists(DUCKDB_FILE):
    os.remove(DUCKDB_FILE)
con = duckdb.connect(DUCKDB_FILE)

# 2. 安装并加载 SQLite 扩展
con.execute("INSTALL sqlite;")
con.execute("LOAD sqlite;")

# 3. 将 SQLite 数据库附加到当前连接
con.execute(f"ATTACH '{SQLITE_FILE}' AS chembl_sqlite (TYPE SQLITE);")
print("SQLite 数据库附加成功。")

# Corrected line
tables = con.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'chembl_sqlite';").fetchall()
print(f"共发现 {len(tables)} 个表，准备开始导入...")

# 5. 循环遍历所有表，并将它们完整地复制到 DuckDB 中
for i, table_tuple in enumerate(tables):
    table_name = table_tuple[0]
    print(f"({i+1}/{len(tables)}) 正在导入表: {table_name} ...")
    
    # 使用 CREATE TABLE AS SELECT * FROM ... 的方式进行全量复制
    # 这是效率最高的方式
    create_table_sql = f"CREATE TABLE {table_name} AS SELECT * FROM chembl_sqlite.{table_name};"
    con.execute(create_table_sql)

# 6. 关闭连接
con.close()

print("\n🎉 全部数据导入成功！")
print(f"你现在有了一个高性能的 DuckDB 数据库文件: '{DUCKDB_FILE}'")