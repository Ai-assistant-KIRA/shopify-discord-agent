import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("PRAGMA table_info(workflow_entity)")
print("columns:", [r[1] for r in cur.fetchall()])
cur.execute(
    "SELECT id, name, active, isArchived, versionCounter, activeVersionId FROM workflow_entity WHERE id = ?",
    (WF,),
)
print("workflow:", cur.fetchone())
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%workflow%'")
print("tables:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT id, name, active FROM workflow_entity WHERE active = 1")
print("active workflows:", cur.fetchall())
conn.close()