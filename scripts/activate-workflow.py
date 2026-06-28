import json
import sqlite3
import urllib.error
import urllib.request

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WORKFLOW_ID = "shopify-mcp-discord-agent"
BASE = "http://localhost:5678"


def get_api_key() -> str:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        "SELECT apiKey FROM user_api_keys WHERE audience='public-api' ORDER BY updatedAt DESC LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise RuntimeError("No n8n public API key found")
    return row[0]


def api_request(method: str, path: str, body=None):
    headers = {"Accept": "application/json", "X-N8N-API-KEY": get_api_key()}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    wf = api_request("GET", f"/api/v1/workflows/{WORKFLOW_ID}")
    print(f"Workflow: {wf['name']} | active={wf.get('active')}")

    webhook_nodes = [
        n for n in wf.get("nodes", []) if n.get("type") == "n8n-nodes-base.webhook"
    ]
    for node in webhook_nodes:
        print(f"Webhook path: {node.get('parameters', {}).get('path')}")

    print("Deactivating...")
    try:
        api_request("POST", f"/api/v1/workflows/{WORKFLOW_ID}/deactivate")
    except urllib.error.HTTPError as e:
        print("Deactivate note:", e.read().decode()[:200])

    print("Activating...")
    api_request("POST", f"/api/v1/workflows/{WORKFLOW_ID}/activate")
    print("Workflow activated.")


if __name__ == "__main__":
    main()