import { AgentConfig } from "./types.js";
import { MemoryStore } from "../memory/store.js";

/**
 * DynamicAgentRegistry merges static (YAML) and dynamic (SQLite) agents.
 * Static agents take precedence - you cannot override built-in agents.
 */
export class DynamicAgentRegistry {
  private staticAgents: Map<string, AgentConfig>;
  private store: MemoryStore;

  constructor(staticAgents: Map<string, AgentConfig>, store: MemoryStore) {
    this.staticAgents = staticAgents;
    this.store = store;
  }

  /**
   * Get an agent by name (static takes precedence over dynamic)
   */
  get(name: string): AgentConfig | undefined {
    return this.staticAgents.get(name) ?? this.store.getAgent(name) ?? undefined;
  }

  /**
   * Check if an agent exists
   */
  has(name: string): boolean {
    return this.staticAgents.has(name) || this.store.hasAgent(name);
  }

  /**
   * Get all agents (static + dynamic, static wins on name conflicts)
   */
  getAll(): AgentConfig[] {
    const dynamic = this.store.getAllAgents();
    const staticNames = new Set(this.staticAgents.keys());

    return [
      ...this.staticAgents.values(),
      ...dynamic.filter((a) => !staticNames.has(a.name)),
    ];
  }

  /**
   * Get all agents available for routing (excludes orchestrator)
   */
  getRoutableAgents(): AgentConfig[] {
    return this.getAll().filter((a) => a.name !== "orchestrator");
  }

  /**
   * Check if an agent is dynamic (not from YAML)
   */
  isDynamic(name: string): boolean {
    return !this.staticAgents.has(name) && this.store.hasAgent(name);
  }

  /**
   * Check if a name is reserved (static agent name)
   */
  isReserved(name: string): boolean {
    return this.staticAgents.has(name);
  }

  /**
   * Get all static agent names (reserved)
   */
  getReservedNames(): string[] {
    return [...this.staticAgents.keys()];
  }

  /**
   * Get the underlying store for direct agent management
   */
  getStore(): MemoryStore {
    return this.store;
  }
}
