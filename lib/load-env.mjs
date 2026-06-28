import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(root, "config");
const configEnvPath = path.join(configDir, ".env");
const legacyEnvPath = path.join(root, ".env");

let loaded = false;

/** Load persistent config once. config/.env takes priority over root .env for unset vars. */
export function loadEnv() {
  if (loaded) return { configDir, configEnvPath, hasConfig: fs.existsSync(configEnvPath) };

  if (fs.existsSync(configEnvPath)) {
    dotenv.config({ path: configEnvPath });
  }
  if (fs.existsSync(legacyEnvPath)) {
    dotenv.config({ path: legacyEnvPath });
  }

  loaded = true;
  return { configDir, configEnvPath, hasConfig: fs.existsSync(configEnvPath) };
}

export function getConfigDir() {
  return configDir;
}

export function getConfigEnvPath() {
  return configEnvPath;
}

export function configExists() {
  return fs.existsSync(configEnvPath);
}