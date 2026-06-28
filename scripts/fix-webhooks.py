import json
import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()

# Remove malformed duplicate webhook registration
cur.execute(
    "DELETE FROM webhook_entity WHERE workflowId = ? AND webhookPath LIKE '%discord%20webhook%'",
    (WF,),
)
print(f"Deleted malformed webhooks: {cur.rowcount}")

cur.execute(
    "SELECT versionId, nodes FROM workflow_history WHERE workflowId = ? ORDER BY createdAt DESC LIMIT 1",
    (WF,),
)
version_id, nodes_json = cur.fetchone()
nodes = json.loads(nodes_json)
webhook = next(n for n in nodes if n["name"] == "Discord Webhook")
print("Active version:", version_id)
print("Webhook node path:", webhook.get("parameters", {}).get("path"))
print("Webhook typeVersion:", webhook.get("typeVersion"))

conn.commit()
conn.close()