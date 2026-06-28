import json
import sqlite3
from datetime import datetime

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF = "shopify-mcp-discord-agent"

nodes = [
    {
        "id": "90ca385f-3315-4ba3-ab07-6f81e3d489be",
        "name": "Discord Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [240, 300],
        "parameters": {
            "httpMethod": "POST",
            "path": "discord",
            "responseMode": "onReceived",
            "options": {},
        },
        "webhookId": "discord-shopify-agent",
    },
    {
        "id": "6d88f615-5be0-4a8b-aa58-df59ff7b5fa1",
        "name": "AI Agent",
        "type": "@n8n/n8n-nodes-langchain.agent",
        "typeVersion": 1.7,
        "position": [500, 300],
        "parameters": {
            "promptType": "define",
            "text": "={{ $json.body.content }}",
            "options": {
                "systemMessage": (
                    "You are a Shopify merchant assistant replying in Discord. "
                    "Use MCP tools for real-time store data — never invent numbers.\n"
                    "Keep replies concise and under 1900 characters."
                ),
            },
        },
    },
    {
        "id": "014d59a7-96bf-466d-96f7-b0a68d0bbbe1",
        "name": "Google Vertex Chat Model",
        "type": "@n8n/n8n-nodes-langchain.lmChatGoogleVertex",
        "typeVersion": 1,
        "position": [360, 520],
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
        "typeVersion": 1.3,
        "position": [500, 520],
        "parameters": {
            "sessionIdType": "customKey",
            "sessionKey": (
                "={{ $('Discord Webhook').item.json.body.channel_id || "
                "$('Discord Webhook').item.json.body.user_id || 'discord-default' }}"
            ),
        },
    },
    {
        "id": "319fcbfa-fbfd-4654-be8d-71b5e2be1412",
        "name": "Shopify MCP Tool",
        "type": "@n8n/n8n-nodes-langchain.mcpClientTool",
        "typeVersion": 1.2,
        "position": [640, 520],
        "parameters": {
            "serverTransport": "sse",
            "endpointUrl": "http://localhost:3000/sse",
            "include": "all",
            "options": {},
        },
    },
    {
        "id": "fa49b809-f674-4b53-b452-fef18f70014a",
        "name": "Send Discord Reply",
        "type": "n8n-nodes-base.discord",
        "typeVersion": 2,
        "position": [760, 300],
        "parameters": {
            "authentication": "botToken",
            "resource": "message",
            "operation": "send",
            "channelId": {
                "__rl": True,
                "mode": "id",
                "value": "={{ $('Discord Webhook').item.json.body.channel_id }}",
            },
            "content": "={{ $json.output }}",
            "options": {},
        },
        "credentials": {
            "discordBotApi": {"id": "pe5zMHBtOrBR8GiJ", "name": "Discord Bot account"}
        },
    },
]

connections = {
    "Discord Webhook": {"main": [[{"node": "AI Agent", "type": "main", "index": 0}]]},
    "AI Agent": {"main": [[{"node": "Send Discord Reply", "type": "main", "index": 0}]]},
    "Google Vertex Chat Model": {
        "ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]
    },
    "Memory": {"ai_memory": [[{"node": "AI Agent", "type": "ai_memory", "index": 0}]]},
    "Shopify MCP Tool": {"ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]},
}

now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute(
    """
    UPDATE workflow_entity
    SET nodes = ?, connections = ?, updatedAt = ?
    WHERE id = ?
    """,
    (json.dumps(nodes), json.dumps(connections), now, WF),
)
conn.commit()
conn.close()
print("Updated workflow nodes in database.")