import { registerTool, getToolEntry } from "../lib/tool-registry.mjs";
import { consumePendingWrite } from "../lib/confirm-store.mjs";
import { createPendingWrite } from "../lib/confirm-store.mjs";

registerTool({
  name: "confirm_pending_write",
  description:
    "Execute a high-risk write action after the user replies CONFIRM <token>. Pass the token from the confirmation message.",
  inputSchema: {
    type: "object",
    properties: {
      confirmToken: { type: "string", description: "Token from CONFIRM message, e.g. 'A7K2M9'" },
    },
    required: ["confirmToken"],
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const pending = consumePendingWrite(args.confirmToken);
    if (!pending) {
      throw new Error("Invalid or expired confirmation token. Request the action again.");
    }

    const tool = getToolEntry(pending.toolName);
    if (!tool?.handler) {
      throw new Error(`Unknown pending tool: ${pending.toolName}`);
    }

    return tool.handler(pending.args);
  },
});

export function maybeRequireConfirmation(tool, args) {
  const token = createPendingWrite(tool.name, args);
  const summary = tool.confirmationSummary?.(args) ?? tool.name;
  return `--- CONFIRMATION REQUIRED ---
Action: ${summary}
Reply with: CONFIRM ${token}
This token expires in 5 minutes.`;
}