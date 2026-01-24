import { Hono } from "hono";
import { AgentRegistry } from "../../core/agent.js";

export interface AgentRoutesOptions {
  agentRegistry: AgentRegistry;
}

export function createAgentRoutes(options: AgentRoutesOptions): Hono {
  const app = new Hono();
  const { agentRegistry } = options;

  /**
   * GET /agents
   * List all available agents
   */
  app.get("/", async (c) => {
    const agents = [...agentRegistry.entries()].map(([name, config]) => ({
      name,
      description: config.description,
      model: config.model.name,
      tools: config.tools,
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
    });
  });

  return app;
}
