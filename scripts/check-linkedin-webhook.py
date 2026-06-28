import json
import sqlite3

c = sqlite3.connect(r"C:\Users\KIRA\.n8n\database.sqlite")
cur = c.cursor()
cur.execute('SELECT nodes FROM workflow_entity WHERE id="linkedin-native-publisher"')
nodes = json.loads(cur.fetchone()[0])
for n in nodes:
    if "webhook" in n.get("type", "").lower():
        print(json.dumps(n, indent=2))
c.close()