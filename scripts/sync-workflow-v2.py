"""Push n8n-workflows/discord-shopify-mcp-agent.json into n8n SQLite, preserving Vertex creds."""
import json
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DB = r"C:\Users\KIRA\.n8n\database.sqlite"
WF_ID = "shopify-mcp-discord-agent"
BASE = "http://localhost:5678"
ROOT = Path(__file__).resolve().parents[1]
WF_FILE = ROOT / "n8n-workflows" / "discord-shopify-mcp-agent.json"
VERTEX_CRED = {"googleApi": {"id": "Iwa777R0aGhP8rqG", "name": "Google Service Account account"}}
VERTEX_PROJECT = "project-1299ef17-2cce-4839-99c"


def get_api_key() -> str:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        "SELECT apiKey FROM user_api_keys WHERE audience='public-api' ORDER BY updatedAt DESC LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise SystemExit("No n8n API key in database")
    return row[0]


def patch_vertex(nodes: list) -> None:
    for n in nodes:
        if n.get("name") == "Google Vertex Chat Model":
            n["credentials"] = VERTEX_CRED
            n["parameters"]["projectId"] = {"mode": "id", "value": VERTEX_PROJECT}


def sync_db(wf: dict) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    patch_vertex(wf["nodes"])
    nodes = json.dumps(wf["nodes"])
    connections = json.dumps(wf["connections"])
    settings = json.dumps(wf.get("settings") or {})
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE workflow_entity
        SET nodes = ?, connections = ?, settings = ?, updatedAt = ?, versionCounter = versionCounter + 1
        WHERE id = ?
        """,
        (nodes, connections, settings, now, WF_ID),
    )
    conn.commit()
    conn.close()
    print(f"Synced workflow to DB ({len(wf['nodes'])} nodes).")


def activate() -> None:
    key = get_api_key()
    headers = {"Accept": "application/json", "X-N8N-API-KEY": key}
    for method, path in [
        ("POST", f"/api/v1/workflows/{WF_ID}/deactivate"),
        ("POST", f"/api/v1/workflows/{WF_ID}/activate"),
    ]:
        req = urllib.request.Request(f"{BASE}{path}", headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                print(f"{method} {path} -> {resp.status}")
        except urllib.error.HTTPError as e:
            print(f"{method} {path} -> {e.code}: {e.read().decode()[:200]}")


def main() -> None:
    wf = json.loads(WF_FILE.read_text(encoding="utf-8"))
    sync_db(wf)
    cur = sqlite3.connect(DB)
    c = cur.cursor()
    c.execute("UPDATE workflow_entity SET active=1 WHERE id=?", (WF_ID,))
    cur.commit()
    cur.close()
    activate()


if __name__ == "__main__":
    main()