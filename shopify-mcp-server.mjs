import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { log } from "./lib/logger.mjs";
import { shopConfig, useMockMode } from "./lib/shopify-client.mjs";
import {
  assertWriteAllowed,
  getToolEntry,
  getToolsByTier,
  getVisibleTools,
  isReadOnlyMode,
} from "./lib/tool-registry.mjs";
import { maybeRequireConfirmation } from "./tools/confirm.mjs";
import "./tools/index.mjs";

const app = express();
const PORT = process.env.PORT || 3000;
const MCP_API_KEY = process.env.MCP_API_KEY?.trim() || "";

/** @type {Record<string, SSEServerTransport>} */
const transports = {};

function authMiddleware(req, res, next) {
  if (!MCP_API_KEY) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== MCP_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

function createMcpServer() {
  const server = new Server(
    { name: "shopify-mcp-server", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: getVisibleTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log("info", "Tool invoked", { tool: name, riskTier: getToolEntry(name)?.riskTier });

    try {
      assertWriteAllowed(name);

      const tool = getToolEntry(name);
      if (!tool?.handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      if (!tool.readOnly && tool.riskTier === "high" && !isReadOnlyMode()) {
        const confirmMessage = maybeRequireConfirmation(tool, args);
        if (confirmMessage) {
          return { content: [{ type: "text", text: confirmMessage }] };
        }
      }

      const text = await tool.handler(args);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      log("error", "Tool execution failed", { tool: name, error: error.message });
      return { isError: true, content: [{ type: "text", text: `Error: ${error.message}` }] };
    }
  });

  return server;
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mockMode: useMockMode,
    readOnly: isReadOnlyMode(),
    shopDomain: useMockMode ? null : shopConfig.domain,
    apiVersion: shopConfig.apiVersion,
    activeSessions: Object.keys(transports).length,
    tools: getVisibleTools().map((t) => t.name),
    toolsByTier: getToolsByTier(),
  });
});

app.get("/sse", authMiddleware, async (req, res) => {
  try {
    const transport = new SSEServerTransport("/message", res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;

    transport.onclose = () => {
      delete transports[sessionId];
      log("info", "SSE client disconnected", { sessionId, activeSessions: Object.keys(transports).length });
    };

    const server = createMcpServer();
    await server.connect(transport);
    log("info", "SSE client connected", { sessionId, activeSessions: Object.keys(transports).length });
  } catch (error) {
    log("error", "SSE connection failed", { error: error.message });
    if (!res.headersSent) {
      res.status(500).send("Error establishing SSE stream");
    }
  }
});

app.post("/message", express.json(), authMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    log("warn", "POST /message without sessionId");
    return res.status(400).send("Missing sessionId parameter");
  }

  const transport = transports[sessionId];
  if (!transport) {
    log("warn", "POST /message for unknown session", { sessionId });
    return res.status(404).send("Session not found");
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    log("error", "Message handler failed", { sessionId, error: error.message });
    if (!res.headersSent) {
      res.status(500).send(`Internal Server Error: ${error.message}`);
    }
  }
});

app.listen(PORT, () => {
  log("info", "Shopify MCP server started", {
    port: PORT,
    sse: `http://localhost:${PORT}/sse`,
    health: `http://localhost:${PORT}/health`,
    toolCount: getVisibleTools().length,
  });
});