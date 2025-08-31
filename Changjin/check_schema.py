# check_schema.py
import duckdb

DB_PATH = 'chembl_35/chembl_35.duckdb'

def check_table_columns(table_name):
    try:
        con = duckdb.connect(database=DB_PATH, read_only=True)
        print(f"--- Schema for table: {table_name} ---")
        # DESCRIBE 是一个SQL命令，用来显示表的结构
        columns = con.execute(f"DESCRIBE {table_name};").fetchall()
        
        has_fingerprint = False
        for col in columns:
            print(f"Column Name: {col[0]}, Type: {col[1]}")
            if col[0].lower() == 'fingerprint_hex':
                has_fingerprint = True
        
        print("---")
        if has_fingerprint:
            print("✅ Good news! The 'fingerprint_hex' column already exists.")
        else:
            print("❌ As expected, the 'fingerprint_hex' column does NOT exist. You need to run the preprocessing script.")
        
        con.close()
    except Exception as e:
        print(f"An error occurred. Does the table '{table_name}' exist? Error: {e}")

def list_tables():
    """如果你不确定表名，先用这个函数列出所有表"""
    try:
        con = duckdb.connect(database=DB_PATH, read_only=True)
        print("--- Tables in the database ---")
        tables = con.execute("SHOW TABLES;").fetchall()
        for table in tables:
            print(table[0])
        con.close()
    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    # 如果你不确定你的表名是什么，请先运行 list_tables()
    print("Listing all tables first to find the correct one...")
    list_tables()
    
    # --- !! 请在这里填入你从上面列表看到的正确的表名 !! ---
    # 很可能叫做 'compound_structures' 或类似的
    target_table = "compound_structures" 
    print(f"\nNow checking the schema for table '{target_table}'...")
    check_table_columns(target_table)