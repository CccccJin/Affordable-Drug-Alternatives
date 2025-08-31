import os
import duckdb
import csv

# --- 配置 ---
# 确保这里的路径与您的项目结构匹配
DB_FILE = os.path.join("chembl_35", "chembl_35.duckdb")
OUTPUT_CSV_FILE = "chembl_export.csv"
ROW_LIMIT = None  # 设置要导出的行数限制，如果想导出全部数据，请设置为 None

def export_data_to_csv(limit: int | None = ROW_LIMIT):
    """
    连接到ChEMBL DuckDB数据库，查询分子信息，并将结果导出为CSV文件。
    """
    if not os.path.exists(DB_FILE):
        print(f"错误：数据库文件未找到，请检查路径：{DB_FILE}")
        return

    # 1. 构建SQL查询语句
    # - 使用 JOIN 连接三个关键表：molecule_dictionary, compound_structures, molecule_synonyms
    # - 使用 LEFT JOIN 来确保即使没有别名的分子也会被包含进来
    # - 使用 string_agg 函数将一个分子的多个别名用分号合并成一个字符串
    # - 使用 GROUP BY 来为每个分子聚合其别名
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

    print(f"准备连接到数据库: {DB_FILE}")
    con = duckdb.connect(database=DB_FILE, read_only=True)
    
    print("正在执行SQL查询... (如果数据量大，可能需要一些时间)")
    results = con.execute(sql_query).fetchall()
    con.close()
    
    if not results:
        print("查询没有返回任何结果。")
        return

    print(f"查询完成，共获取 {len(results)} 条记录。")
    print(f"正在写入到文件: {OUTPUT_CSV_FILE}")

    # 2. 使用csv模块写入文件，以正确处理特殊字符和逗号
    try:
        with open(OUTPUT_CSV_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            # 写入表头
            writer.writerow(['molecule_chembl_id', 'canonical_smiles', 'molecule_synonyms'])
            
            # 写入数据行
            writer.writerows(results)
            
        print(f"\n✅ 成功！数据已成功导出到 {OUTPUT_CSV_FILE}")
    except IOError as e:
        print(f"\n❌ 失败：写入文件时发生错误: {e}")


if __name__ == "__main__":
    export_data_to_csv()