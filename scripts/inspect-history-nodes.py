import json
import sqlite3

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute(
    "SELECT nodes FROM workflow_history WHERE workflowId = ? ORDER BY createdAt DESC LIMIT 1",
    (WF,),
)
nodes = json.loads(cur.fetchone()[0])
for n in nodes:
    print(n["name"], n["type"], n.get("typeVersion"))
    if n["name"] == "Memory":
        print("  params:", n.get("parameters"))
    if n["name"] == "Shopify MCP Tool":
        print("  params:", n.get("parameters"))

cur.execute("SELECT nodes FROM workflow_entity WHERE id = ?", (WF,))
entity_nodes = json.loads(cur.fetchone()[0])
mem_entity = next(n for n in entity_nodes if n["name"] == "Memory")
mem_hist = next(n for n in nodes if n["name"] == "Memory")
print("\nentity memory params:", mem_entity.get("parameters"))
print("history memory params:", mem_hist.get("parameters"))
conn.close()