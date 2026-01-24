import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { AgentConfig, AgentConfigSchema } from "./types.js";

// Convert kebab-case YAML keys to camelCase
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeys);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        toCamelCase(key),
        transformKeys(value),
      ])
    );
  }
  return obj;
}

// Interpolate environment variables in strings: ${ENV_VAR}
function interpolateEnvVars(content: string): string {
  return content.replace(/\$\{(\w+)\}/g, (_, name) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`Environment variable ${name} is not defined`);
    }
    return value;
  });
}

export function loadAgentConfig(configPath: string): AgentConfig {
  const raw = readFileSync(configPath, "utf-8");
  const interpolated = interpolateEnvVars(raw);
  const parsed = parse(interpolated);
  const transformed = transformKeys(parsed);
  return AgentConfigSchema.parse(transformed);
}

export function loadAllAgentConfigs(
  configDir: string
): Map<string, AgentConfig> {
  const configs = new Map<string, AgentConfig>();
  const files = readdirSync(configDir).filter((f) => f.endsWith(".yaml"));

  for (const file of files) {
    const config = loadAgentConfig(join(configDir, file));
    configs.set(config.name, config);
  }

  return configs;
}
