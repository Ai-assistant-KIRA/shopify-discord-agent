import json
import sqlite3
import uuid
from datetime import datetime

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("SELECT nodes, connections, name, description FROM workflow_entity WHERE id = ?", (WF,))
name, description, *_ = None, None
row = cur.fetchone()
nodes = json.loads(row[0])
connections = json.loads(row[1])
name = row[2] if len(row) > 2 else "test"
description = row[3] if len(row) > 3 else ""

# Drop Discord reply to isolate validation issues
nodes = [n for n in nodes if n["name"] != "Send Discord Reply"]
connections["AI Agent"] = {"main": [[]]}

new_version = str(uuid.uuid4())
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

cur.execute(
    "UPDATE workflow_entity SET nodes=?, connections=?, versionId=?, activeVersionId=?, updatedAt=? WHERE id=?",
    (json.dumps(nodes), json.dumps(connections), new_version, new_version, now, WF),
)
cur.execute(
    """INSERT INTO workflow_history (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
    (new_version, WF, "Adam Vensol", now, now, json.dumps(nodes), json.dumps(connections), name, description),
)
cur.execute("DELETE FROM workflow_published_version WHERE workflowId=?", (WF,))
cur.execute(
    "INSERT INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt) VALUES (?,?,?,?)",
    (WF, new_version, now, now),
)
conn.commit()
conn.close()
print("Minimal workflow without Discord reply:", new_version)