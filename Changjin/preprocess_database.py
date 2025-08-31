# preprocess_database.py
import os  
import duckdb
from rdkit import Chem
from rdkit.Chem import AllChem

# --- 推荐的路径设置方法 ---
# 1. 获取当前脚本所在的目录
script_directory = os.path.dirname(os.path.abspath(__file__))

# 2. 使用 os.path.join 来安全地构建路径
# 这会把脚本目录和后面的路径部分智能地连接起来
DB_FILE = os.path.join(script_directory, "chembl_35", "chembl_35.duckdb")

print(f"Attempting to connect to database at: {DB_FILE}") # 打印路径方便调试
# --- 路径设置结束 ---
TABLE_NAME = "compound_structures" # 假设你的表名是这个，请根据实际情况修改

def smiles_to_fingerprint_hex(smiles: str, n_bits: int = 1024):
    """计算指纹并返回可储存的十六进制字符串"""
    if not smiles: return None
    mol = Chem.MolFromSmiles(smiles)
    if not mol: return None
    
    # This is the old, deprecated function that exists in your RDKit version
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=n_bits)
    
    return fp.ToBitString().encode('utf-8').hex()
def run_preprocessing():
    con = duckdb.connect(DB_FILE)
    
    # 1. 检查指纹列是否存在，如果不存在则添加
    try:
        con.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN fingerprint_hex VARCHAR;")
        print("Column 'fingerprint_hex' added.")
    except Exception as e:
        print(f"Could not add column (maybe it already exists?): {e}")

    # 2. 获取所有需要处理的分子
    # 注意：只选择那些还没有计算指纹的行
    rows_to_process = con.execute(
        f"SELECT molregno, canonical_smiles FROM {TABLE_NAME} WHERE canonical_smiles IS NOT NULL AND fingerprint_hex IS NULL"
    ).fetchall()
    
    total_rows = len(rows_to_process)
    print(f"Found {total_rows} molecules to process.")

    # 3. 逐一计算并更新指纹
    for i, (molregno, smiles) in enumerate(rows_to_process):
        fp_hex = smiles_to_fingerprint_hex(smiles)
        if fp_hex:
            con.execute(f"UPDATE {TABLE_NAME} SET fingerprint_hex = ? WHERE molregno = ?", (fp_hex, molregno))
        
        if (i + 1) % 1000 == 0: # 每处理1000个打印一次进度
            print(f"Processed {i + 1}/{total_rows}...")
            
    con.close()
    print("Database preprocessing complete.")

if __name__ == "__main__":
    run_preprocessing()