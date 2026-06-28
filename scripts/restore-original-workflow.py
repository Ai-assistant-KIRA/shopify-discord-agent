import json
import sqlite3
import uuid
from datetime import datetime

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

nodes = [
    {
        "id": "90ca385f-3315-4ba3-ab07-6f81e3d489be",
        "name": "Discord Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [100, 240],
        "webhookId": "discord",
        "parameters": {
            "httpMethod": "POST",
            "path": "discord",
            "responseMode": "lastNode",
            "options": {},
        },
    },
    {
        "id": "6d88f615-5be0-4a8b-aa58-df59ff7b5fa1",
        "name": "AI Agent",
        "type": "@n8n/n8n-nodes-langchain.agent",
        "typeVersion": 1.6,
        "position": [350, 240],
        "parameters": {
            "promptType": "define",
            "text": "={{ $json.body.content }}",
            "options": {
                "systemMessage": (
                    "You are a helpful Shopify merchant assistant. Use MCP tools for store data. "
                    "Keep Discord replies concise."
                ),
            },
        },
    },
    {
        "id": "014d59a7-96bf-466d-96f7-b0a68d0bbbe1",
        "name": "Google Vertex Chat Model",
        "type": "@n8n/n8n-nodes-langchain.lmChatGoogleVertex",
        "typeVersion": 1,
        "position": [250, 440],
        "parameters": {
            "projectId": {"mode": "id", "value": "project-1299ef17-2cce-4839-99c"},
            "modelName": "gemini-2.5-flash",
            "options": {},
        },
        "credentials": {
            "googleApi": {"id": "Iwa777R0aGhP8rqG", "name": "Google Service Account account"}
        },
    },
    {
        "id": "b428d01a-6df7-4581-9132-8408a287fa44",
        "name": "Memory",
        "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
        "typeVersion": 1.2,
        "position": [400, 440],
        "parameters": {
            "sessionIdType": "customKey",
            "sessionKey": "={{ $json.body.channel_id || $json.body.user_id || 'discord-default' }}",
            "contextWindowLength": 10,
        },
    },
    {
        "id": "319fcbfa-fbfd-4654-be8d-71b5e2be1412",
        "name": "Shopify MCP Tool",
        "type": "@n8n/n8n-nodes-langchain.mcpClientTool",
        "typeVersion": 1.2,
        "position": [550, 440],
        "parameters": {
            "authentication": "none",
            "serverTransport": "sse",
            "endpointUrl": "http://localhost:3000/sse",
            "include": "all",
            "options": {},
        },
    },
]

connections = {
    "Discord Webhook": {"main": [[{"node": "AI Agent", "type": "main", "index": 0}]]},
    "AI Agent": {"main": [[]]},
    "Google Vertex Chat Model": {
        "ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]
    },
    "Memory": {"ai_memory": [[{"node": "AI Agent", "type": "ai_memory", "index": 0}]]},
    "Shopify MCP Tool": {"ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]},
}

new_version = str(uuid.uuid4())
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("SELECT name, description FROM workflow_entity WHERE id = ?", (WF,))
name, description = cur.fetchone()

cur.execute(
    """
    UPDATE workflow_entity
    SET nodes = ?, connections = ?, versionId = ?, activeVersionId = ?, active = 1, updatedAt = ?
    WHERE id = ?
    """,
    (json.dumps(nodes), json.dumps(connections), new_version, new_version, now, WF),
)

cur.execute(
    """
    INSERT INTO workflow_history (
        versionId, workflowId, authors, createdAt, updatedAt,
        nodes, connections, name, autosaved, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    """,
    (new_version, WF, "Adam Vensol", now, now, json.dumps(nodes), json.dumps(connections), name, description),
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
print(f"Fixed workflow for n8n 2.14, version {new_version}")