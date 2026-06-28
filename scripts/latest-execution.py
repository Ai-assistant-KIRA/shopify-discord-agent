import json
import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute(
    """
    SELECT e.id, e.status, e.startedAt, ed.data
    FROM execution_entity e
    LEFT JOIN execution_data ed ON ed.executionId = e.id
    WHERE e.workflowId = ?
    ORDER BY e.id DESC
    LIMIT 1
    """,
    (WF,),
)
row = cur.fetchone()
if row:
    exec_id, status, started, data = row
    print(f"Latest: #{exec_id} status={status} started={started}")
    if data:
        print(data[:3000])
conn.close()