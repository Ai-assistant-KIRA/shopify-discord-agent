import { execSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Workflow, NodeHelpers } = require("C:/Users/KIRA/AppData/Roaming/npm/node_modules/n8n/node_modules/n8n-workflow");
const { NodeTypes } = require("C:/Users/KIRA/AppData/Roaming/npm/node_modules/n8n/dist/node-types").NodeTypes;

const raw = execSync(
  `python -c "import sqlite3,json; c=sqlite3.connect(r'C:\\\\Users\\\\KIRA\\\\.n8n\\\\database.sqlite'); cur=c.cursor(); cur.execute('SELECT nodes, connections, settings FROM workflow_entity WHERE id=\\\"shopify-mcp-discord-agent\\\"'); n,conn,s=cur.fetchone(); print(json.dumps({'nodes':json.loads(n),'connections':json.loads(conn),'settings':json.loads(s) if s else {}})); c.close()"`,
  { encoding: "utf8" }
);
const { nodes, connections, settings } = JSON.parse(raw);

const nodeTypes = new NodeTypes();
await nodeTypes.init();

const workflow = new Workflow({
  id: "shopify-mcp-discord-agent",
  name: "test",
  nodes,
  connections,
  active: true,
  nodeTypes,
  settings,
});

for (const node of nodes) {
  const nodeType = nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
  if (!nodeType) {
    console.log(`MISSING TYPE: ${node.name} ${node.type} v${node.typeVersion}`);
    continue;
  }
  const issues = NodeHelpers.getNodeParametersIssues(
    nodeType.description.properties,
    node,
    nodeType.description
  );
  console.log(`${node.name}:`, issues ? JSON.stringify(issues) : "OK");
}