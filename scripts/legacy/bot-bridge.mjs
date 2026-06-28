/**
 * @deprecated Use scripts/discord-bridge.mjs instead.
 * This file exists for backward compatibility only.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "discord-bridge.mjs");
spawn("node", [script], { stdio: "inherit", shell: true });