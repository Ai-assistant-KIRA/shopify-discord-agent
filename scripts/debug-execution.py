import json
import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute(
    """
    SELECT e.id, e.status, ed.data
    FROM execution_entity e
    LEFT JOIN execution_data ed ON ed.executionId = e.id
    WHERE e.workflowId = ?
    ORDER BY e.id DESC
    LIMIT 3
    """,
    (WF,),
)
rows = cur.fetchall()
for exec_id, status, data in rows:
    print(f"\n=== execution #{exec_id} status={status} ===")
    if not data:
        continue
    parsed = json.loads(data)
    text = json.dumps(parsed)[:4000]
    print(text)

cur.execute("SELECT nodes FROM workflow_entity WHERE id = ?", (WF,))
nodes = json.loads(cur.fetchone()[0])
print("\n=== workflow nodes ===")
for n in nodes:
    print(n["name"], n["type"], "cred=", n.get("credentials"))

conn.close()