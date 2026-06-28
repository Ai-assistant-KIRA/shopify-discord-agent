import json
import sqlite3

c = sqlite3.connect(r"C:\Users\KIRA\.n8n\database.sqlite")
cur = c.cursor()
cur.execute(
    "SELECT activeVersionId, versionId FROM workflow_entity WHERE id='shopify-mcp-discord-agent'"
)
print("entity versions:", cur.fetchone())
cur.execute(
    "SELECT publishedVersionId FROM workflow_published_version WHERE workflowId='shopify-mcp-discord-agent'"
)
print("published:", cur.fetchone())
cur.execute(
    "SELECT nodes FROM workflow_history WHERE workflowId='shopify-mcp-discord-agent' ORDER BY createdAt DESC LIMIT 1"
)
nodes = json.loads(cur.fetchone()[0])
for n in nodes:
    if n["name"] in ("Discord Webhook", "Send Discord Reply", "Memory", "Shopify MCP Tool"):
        print(f"\n{n['name']} v{n.get('typeVersion')}")
        print("  webhookId:", n.get("webhookId"))
        print("  params:", json.dumps(n.get("parameters"), indent=2)[:500])
c.close()