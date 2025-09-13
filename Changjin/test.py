from db import get_db_connection
con = get_db_connection()
print(con.execute("SELECT chembl_id, fingerprint_hex FROM compound_structures LIMIT 5").fetchall())

print(con.execute("SELECT COUNT(*) FROM compound_structures").fetchall())
