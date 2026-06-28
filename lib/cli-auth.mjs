import fs from "fs";
import os from "os";
import path from "path";

export function resolveCliAccessToken() {
  try {
    const configPath = path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "shopify-cli-kit-nodejs",
      "Config",
      "config.json"
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const session = JSON.parse(config.sessionStore);
    const current = session["accounts.shopify.com"]?.[config.currentSessionId];
    if (!current) return null;

    const apps = current.applications;
    if (apps && typeof apps === "object") {
      const now = Date.now();
      for (const entry of Object.values(apps)) {
        const token = entry?.accessToken?.trim();
        const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : Infinity;
        if (token && expiresAt > now) return token;
      }
    }

    return current.identity?.accessToken?.trim() || null;
  } catch {
    return null;
  }
}