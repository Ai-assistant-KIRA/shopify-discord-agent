import sqlite3
from datetime import datetime

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("SELECT versionId, activeVersionId, active FROM workflow_entity WHERE id = ?", (WF,))
row = cur.fetchone()
if not row:
    raise SystemExit(f"Workflow {WF} not found")

version_id, active_version_id, active = row
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
print(f"versionId={version_id}, activeVersionId={active_version_id}, active={active}")

cur.execute(
    "DELETE FROM workflow_published_version WHERE workflowId = ?",
    (WF,),
)
cur.execute(
    """
    INSERT INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
    """,
    (WF, version_id, now, now),
)
cur.execute(
    "UPDATE workflow_entity SET activeVersionId = ?, active = 1, updatedAt = ? WHERE id = ?",
    (version_id, now, WF),
)
conn.commit()
conn.close()
print(f"Published and set activeVersionId for {WF}")