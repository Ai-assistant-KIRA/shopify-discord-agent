import sqlite3
import json
import uuid
from datetime import datetime

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()

cur.execute("PRAGMA table_info(workflow_history)")
print("history columns:", [r[1] for r in cur.fetchall()])
cur.execute(
    "SELECT versionId, authors FROM workflow_history WHERE workflowId = ? ORDER BY createdAt DESC LIMIT 3",
    (WF,),
)
print("history:", cur.fetchall())

cur.execute("SELECT nodes, versionId FROM workflow_entity WHERE id = ?", (WF,))
row = cur.fetchone()
nodes, version_id = row[0], row[1]
node_names = [n["name"] for n in json.loads(nodes)]
print("entity versionId:", version_id)
print("entity nodes:", node_names)

cur.execute(
    "SELECT publishedVersionId FROM workflow_published_version WHERE workflowId = ?",
    (WF,),
)
pub = cur.fetchone()
print("publishedVersionId:", pub)

# Check if published version matches entity version
if pub and pub[0] != version_id:
    print("MISMATCH: published version differs from entity versionId")

conn.close()