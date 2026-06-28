import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { log } from "./logger.mjs";

export function shopifyGraphQLViaAppExecute(domain, appDir, query, variables = {}, apiVersion = "2025-01") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shopify-mcp-"));
  const queryFile = path.join(tmpDir, "query.graphql");
  const varFile = path.join(tmpDir, "vars.json");
  const hasVars = variables && Object.keys(variables).length > 0;

  fs.writeFileSync(queryFile, query.trim(), "utf8");
  if (hasVars) {
    fs.writeFileSync(varFile, JSON.stringify(variables), "utf8");
  }

  const args = [
    "app",
    "execute",
    "--store",
    domain,
    "--query-file",
    queryFile,
    "--version",
    apiVersion,
  ];
  if (hasVars) args.push("--variable-file", varFile);

  const result = spawnSync("shopify", args, {
    cwd: appDir,
    encoding: "utf8",
    timeout: 120000,
    shell: process.platform === "win32",
  });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    log("error", "shopify app execute failed", { status: result.status, output: output.slice(-500) });
    throw new Error(`shopify app execute failed: ${output.slice(-300)}`);
  }

  if (output.includes("╭─ error")) {
    const errMsg = output.match(/"message":\s*"([^"]+)"/)?.[1];
    throw new Error(errMsg ? `Shopify GraphQL Error: ${errMsg}` : `shopify app execute error: ${output.slice(-300)}`);
  }

  const json = extractJsonPayload(output);
  if (json.errors?.length) {
    throw new Error(`Shopify API Error: ${JSON.stringify(json.errors)}`);
  }
  return json.data ?? json;
}

function extractJsonPayload(output) {
  const successIdx = output.indexOf("╭─ success");
  const errorIdx = output.indexOf("╭─ error");
  let slice = output;
  if (successIdx > 0) slice = output.slice(0, successIdx);
  else if (errorIdx > 0) slice = output.slice(0, errorIdx);

  const dataMarker = slice.indexOf('"data"');
  const start = dataMarker > -1 ? slice.lastIndexOf("{", dataMarker) : slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not parse shopify app execute output: ${slice.slice(-200)}`);
  }
  return JSON.parse(slice.slice(start, end + 1));
}