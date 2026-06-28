import json
import sqlite3
import urllib.error
import urllib.request

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WORKFLOW_ID = "shopify-mcp-discord-agent"
PROJECT_ID = "FrdpURUzYdaFwaCl"
BASE = "http://localhost:5678"


def get_api_key() -> str:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        "SELECT apiKey FROM user_api_keys WHERE audience='public-api' ORDER BY updatedAt DESC LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()
    return row[0]


def ensure_shared_workflow():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        "SELECT workflowId FROM shared_workflow WHERE workflowId = ? AND role = 'workflow:owner'",
        (WORKFLOW_ID,),
    )
    if not cur.fetchone():
        cur.execute(
            """
            INSERT INTO shared_workflow (workflowId, projectId, role, createdAt, updatedAt)
            VALUES (?, ?, 'workflow:owner', datetime('now'), datetime('now'))
            """,
            (WORKFLOW_ID, PROJECT_ID),
        )
        conn.commit()
        print("Created missing SharedWorkflow owner row.")
    else:
        print("SharedWorkflow owner row already exists.")
    conn.close()


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
    ensure_shared_workflow()

    try:
        api_request("POST", f"/api/v1/workflows/{WORKFLOW_ID}/deactivate")
        print("Deactivated.")
    except urllib.error.HTTPError as e:
        print("Deactivate:", e.code, e.read().decode()[:120])

    api_request("POST", f"/api/v1/workflows/{WORKFLOW_ID}/activate")
    print("Activated shopify-mcp-discord-agent.")

    # verify webhook
    import time

    time.sleep(1)
    payload = json.dumps(
        {
            "content": "How much revenue today?",
            "channel_id": "000000000000000000",
            "user_id": "test",
            "username": "tester",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/webhook/discord",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"Webhook test -> {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"Webhook test -> {e.code}: {e.read().decode()[:200]}")


if __name__ == "__main__":
    main()