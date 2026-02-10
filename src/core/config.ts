import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { AgentConfig, AgentConfigSchema } from "./types.js";

// Convert snake_case YAML keys to camelCase
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

/**
 * Load all agent configs from a flat directory (legacy config/ support)
 */
export function loadAllAgentConfigs(
  configDir: string
): Map<string, AgentConfig> {
  const configs = new Map<string, AgentConfig>();

  if (!existsSync(configDir)) {
    return configs;
  }

  const files = readdirSync(configDir).filter((f) => f.endsWith(".yaml"));

  for (const file of files) {
    const config = loadAgentConfig(join(configDir, file));
    configs.set(config.name, config);
  }

  return configs;
}

/**
 * Recursively load all agent configs from a directory tree.
 * Supports agents organized in subdirectories by category.
 */
export function loadAgentConfigsRecursive(
  agentsDir: string
): Map<string, AgentConfig> {
  const configs = new Map<string, AgentConfig>();

  if (!existsSync(agentsDir)) {
    return configs;
  }

  function scanDir(dir: string): void {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.endsWith(".yaml")) {
        const config = loadAgentConfig(fullPath);
        configs.set(config.name, config);
      }
    }
  }

  scanDir(agentsDir);
  return configs;
}

/**
 * Load a reference document from the references/ directory.
 * Returns the markdown content or null if not found.
 */
export function loadReferenceDoc(
  referencesDir: string,
  refPath: string
): string | null {
  const fullPath = join(referencesDir, refPath);

  if (!existsSync(fullPath)) {
    return null;
  }

  return readFileSync(fullPath, "utf-8");
}

/**
 * Load all reference docs for an agent and combine them into a single context block.
 */
export function loadAgentReferences(
  referencesDir: string,
  references: string[]
): string {
  const docs: string[] = [];

  for (const ref of references) {
    const content = loadReferenceDoc(referencesDir, ref);
    if (content) {
      docs.push(`## Reference: ${ref}\n\n${content}`);
    }
  }

  return docs.join("\n\n---\n\n");
}
