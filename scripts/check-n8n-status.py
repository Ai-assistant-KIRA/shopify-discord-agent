import sqlite3

db = r"C:\Users\KIRA\.n8n\database.sqlite"
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute(
    "SELECT id, name, active FROM workflow_entity WHERE name LIKE '%Shopify%' OR name LIKE '%Discord%'"
)
print("WORKFLOWS:")
for row in cur.fetchall():
    print(row)
cur.execute(
    "SELECT id, name, type FROM credentials_entity WHERE name LIKE '%Discord%' OR name LIKE '%Google%'"
)
print("CREDENTIALS:")
for row in cur.fetchall():
    print(row)
conn.close()