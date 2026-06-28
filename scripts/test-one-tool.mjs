import http from "http";

const [toolName, ...argPairs] = process.argv.slice(2);
if (!toolName) {
  console.error("Usage: node scripts/test-one-tool.mjs <tool> key=value ...");
  process.exit(1);
}

const args = Object.fromEntries(
  argPairs.map((pair) => {
    const i = pair.indexOf("=");
    return [pair.slice(0, i), pair.slice(i + 1)];
  })
);

const MCP_PORT = Number(process.env.PORT || 3000);
let mcpPath = "/message";
const sseMessages = [];

function httpRequest({ method, path, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: MCP_PORT, path, method, headers: body ? { "Content-Type": "application/json" } : {} },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function waitForJsonRpcResponse(id, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const match = sseMessages.find((m) => m.id === id);
      if (match) return resolve(match);
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout id=${id}`));
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function callMcp(method, params, id) {
  const postRes = await httpRequest({
    method: "POST",
    path: mcpPath,
    body: { jsonrpc: "2.0", id, method, params },
  });
  if (postRes.status === 200 && postRes.body?.startsWith?.("{")) {
    try {
      return JSON.parse(postRes.body);
    } catch {
      /* fall through */
    }
  }
  return waitForJsonRpcResponse(id);
}

async function connectSse() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
      res.on("data", (chunk) => {
        const text = chunk.toString();
        const endpointMatch = text.match(/data:\s+(\S+)/);
        if (endpointMatch) mcpPath = endpointMatch[1];
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload.startsWith("{")) continue;
          try {
            sseMessages.push(JSON.parse(payload));
          } catch {
            /* ignore */
          }
        }
      });
      setTimeout(resolve, 1500);
    });
    req.on("error", reject);
  });
}

await connectSse();
const parsed = await callMcp("tools/call", { name: toolName, arguments: args }, toolName);
if (parsed.error) {
  console.error("FAIL:", parsed.error.message || JSON.stringify(parsed.error));
  process.exit(1);
}
const text = parsed.result?.content?.[0]?.text || "";
if (parsed.result?.isError) {
  console.error("FAIL:", text);
  process.exit(1);
}
console.log("PASS:", toolName);
console.log(text);