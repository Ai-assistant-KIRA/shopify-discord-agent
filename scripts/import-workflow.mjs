import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowFile = process.env.WORKFLOW_FILE || "discord-shopify-mcp-agent.json";
const workflowPath = join(__dirname, "..", "n8n-workflows", workflowFile);
const apiUrl = process.env.N8N_API_URL || "http://localhost:5678/api/v1/workflows";
const apiKey = process.env.N8N_API_KEY;

if (!apiKey) {
  console.error("N8N_API_KEY is required. Create one in n8n Settings > API.");
  process.exit(1);
}

console.log(`Importing workflow: ${workflowFile}`);
const workflow = JSON.parse(await readFile(workflowPath, "utf8"));

const response = await fetch(apiUrl, {
  method: "POST",
  headers: {
    "X-N8N-API-KEY": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(workflow),
});

const body = await response.text();

if (!response.ok) {
  console.error(`Import failed (${response.status}):`, body);
  process.exit(1);
}

console.log("Workflow imported successfully:");
console.log(body);