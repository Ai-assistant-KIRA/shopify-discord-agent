import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info(webhook_entity)")
print("webhook_entity columns:", [r[1] for r in cur.fetchall()])
cur.execute("SELECT * FROM webhook_entity")
for row in cur.fetchall():
    print(row)
conn.close()