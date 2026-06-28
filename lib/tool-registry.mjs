const READ_ONLY = process.env.SHOPIFY_READ_ONLY === "true";

const toolEntries = [];

export function registerTool(entry) {
  toolEntries.push(entry);
}

export function getAllTools() {
  return toolEntries;
}

export function getVisibleTools() {
  const mapped = toolEntries.map(({ handler: _handler, readOnly, riskTier: _riskTier, ...tool }) => tool);
  if (!READ_ONLY) return mapped;
  return toolEntries
    .filter((t) => t.readOnly)
    .map(({ handler: _handler, readOnly, riskTier: _riskTier, ...tool }) => tool);
}

export function getToolEntry(name) {
  return toolEntries.find((t) => t.name === name);
}

export function assertWriteAllowed(toolName) {
  const tool = getToolEntry(toolName);
  if (READ_ONLY && tool && !tool.readOnly) {
    throw new Error(`Write tool "${toolName}" is disabled (SHOPIFY_READ_ONLY=true).`);
  }
}

export function isReadOnlyMode() {
  return READ_ONLY;
}

export function getToolsByTier() {
  const visible = toolEntries.filter((t) => !READ_ONLY || t.readOnly);
  return {
    read: visible.filter((t) => t.readOnly).map((t) => t.name),
    writeLow: visible.filter((t) => !t.readOnly && t.riskTier === "low").map((t) => t.name),
    writeHigh: visible.filter((t) => !t.readOnly && t.riskTier === "high").map((t) => t.name),
  };
}