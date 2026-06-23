import duckdb
import pandas as pd

# 连接到数据库（修改成你的路径）
con = duckdb.connect("chembl_35/chembl_35.duckdb")

# 列出所有表
tables = con.execute("SHOW TABLES").fetchall()

# 常见字段的英文解释（可以自己补充）
field_descriptions = {
    "chembl_id": "Unique ChEMBL identifier of the compound",
    "molregno": "Unique molecule registration number",
    "canonical_smiles": "Canonical SMILES representation of the compound",
    "fingerprint_hex": "Molecular fingerprint encoded as hex string",
    "mw_freebase": "Molecular weight of the free base form",
    "alogp": "Predicted octanol-water partition coefficient (logP)",
    "hba": "Number of hydrogen bond acceptors",
    "hbd": "Number of hydrogen bond donors",
    "psa": "Topological polar surface area",
    "rtb": "Number of rotatable bonds",
    "heavy_atoms": "Number of heavy (non-hydrogen) atoms",
    "aromatic_rings": "Number of aromatic rings",
    "embedding": "Precomputed ChemBERTa molecular embedding vector"
}

# 收集 schema 信息
all_schemas = []

for (table_name,) in tables:
    schema = con.execute(f"PRAGMA table_info('{table_name}')").fetchdf()
    schema.insert(0, "table_name", table_name)  # 添加表名
    # 添加英文解释列
    schema["description"] = schema["name"].map(field_descriptions).fillna("N/A")
    all_schemas.append(schema)

# 合并所有表的字段信息
schema_df = pd.concat(all_schemas, ignore_index=True)

# 保存到 Excel
output_path = "chembl35_schema_with_desc.xlsx"
schema_df.to_excel(output_path, index=False)

con.close()

print(f"✅ Schema with English descriptions exported to {output_path}")
