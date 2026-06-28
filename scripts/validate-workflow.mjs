import sqlite3 from "node:sqlite"; // may not exist
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const n8nWorkflowPath = "C:/Users/KIRA/AppData/Roaming/npm/node_modules/n8n/node_modules/n8n-workflow";
const { Workflow, NodeHelpers } = require(n8nWorkflowPath);

// Load workflow from sqlite via python output
import { execSync } from "child_process";
const nodesJson = execSync(
  `python -c "import sqlite3,json; c=sqlite3.connect(r'C:\\\\Users\\\\KIRA\\\\.n8n\\\\database.sqlite'); cur=c.cursor(); cur.execute('SELECT nodes, connections, settings FROM workflow_entity WHERE id=\\\"shopify-mcp-discord-agent\\\"'); n,conn,s=cur.fetchone(); print(json.dumps({'nodes':json.loads(n),'connections':json.loads(conn),'settings':json.loads(s)})); c.close()"`,
  { encoding: "utf8" }
);
const { nodes, connections, settings } = JSON.parse(nodesJson);

const nodeTypes = {
  getByNameAndVersion(type, version) {
    try {
      const base = type.split(".")[0];
      let pkg;
      if (type.startsWith("@n8n/")) {
        pkg = require(`C:/Users/KIRA/AppData/Roaming/npm/node_modules/n8n/node_modules/${type.split("/")[0]}/${type.split("/")[1]}`);
      } else {
        pkg = require(`C:/Users/KIRA/AppData/Roaming/npm/node_modules/n8n/node_modules/n8n-nodes-base/dist/nodes/${type.replace("n8n-nodes-base.", "").charAt(0).toUpperCase() + type.replace("n8n-nodes-base.", "").slice(1)}/${type.replace("n8n-nodes-base.", "").charAt(0).toUpperCase() + type.replace("n8n-nodes-base.", "").slice(1)}.node.js`);
      }
      return pkg?.default?.[version] || pkg?.default || pkg;
    } catch (e) {
      return undefined;
    }
  },
};

console.log("Validating nodes manually via NodeHelpers where possible...");
for (const node of nodes) {
  console.log(`\n${node.name} (${node.type} v${node.typeVersion})`);
  console.log("  parameters:", JSON.stringify(node.parameters, null, 2));
}