import json
import sqlite3
import uuid
from datetime import datetime

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute(
    "SELECT name, nodes, connections, settings, description FROM workflow_entity WHERE id = ?",
    (WF,),
)
name, nodes, connections, settings, description = cur.fetchone()
new_version = str(uuid.uuid4())
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

cur.execute(
    """
    UPDATE workflow_entity
    SET versionId = ?, activeVersionId = ?, updatedAt = ?
    WHERE id = ?
    """,
    (new_version, new_version, now, WF),
)

cur.execute(
    """
    INSERT INTO workflow_history (
        versionId, workflowId, authors, createdAt, updatedAt,
        nodes, connections, name, autosaved, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    """,
    (new_version, WF, "Adam Vensol", now, now, nodes, connections, name, description),
)

cur.execute("DELETE FROM workflow_published_version WHERE workflowId = ?", (WF,))
cur.execute(
    """
    INSERT INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
    """,
    (WF, new_version, now, now),
)

conn.commit()
conn.close()
print(f"Synced published version: {new_version}")