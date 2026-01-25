import { Hono } from "hono";
import { DynamicAgentRegistry } from "../../core/registry.js";

export interface AgentRoutesOptions {
  agentRegistry: DynamicAgentRegistry;
}

export function createAgentRoutes(options: AgentRoutesOptions): Hono {
  const app = new Hono();
  const { agentRegistry } = options;

  /**
   * GET /agents
   * List all available agents
   */
  app.get("/", async (c) => {
    const agents = agentRegistry.getAll().map((config) => ({
      name: config.name,
      description: config.description,
      model: config.model.name,
      tools: config.tools,
      isDynamic: agentRegistry.isDynamic(config.name),
    }));

    return c.json({ agents });
  });

  /**
   * GET /agents/:name
   * Get details for a specific agent
   */
  app.get("/:name", async (c) => {
    const name = c.req.param("name");
    const config = agentRegistry.get(name);

    if (!config) {
      return c.json({ error: "Agent not found" }, 404);
    }

    return c.json({
      name: config.name,
      description: config.description,
      model: {
        provider: config.model.provider,
        name: config.model.name,
        temperature: config.model.temperature,
        maxTokens: config.model.maxTokens,
      },
      tools: config.tools,
      isDynamic: agentRegistry.isDynamic(config.name),
    });
  });

  return app;
}
