import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info(workflow_dependency)")
print("dep columns:", [r[1] for r in cur.fetchall()])
cur.execute("SELECT * FROM workflow_dependency WHERE workflowId = ?", (WF,))
rows = cur.fetchall()
print("dependencies:", len(rows))
for r in rows[:20]:
    print(r)
conn.close()