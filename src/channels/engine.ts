import type { AgentContext, StreamChunk } from "../core/types.js";
import type { MemoryStore } from "../memory/store.js";
import type { Agent } from "../core/agent.js";

export class ChannelEngine {
  private sessions = new Map<string, AgentContext>();

  constructor(
    private createOrchestrator: (context: AgentContext) => Agent,
    private memoryStore: MemoryStore
  ) {}

  async *run(
    channel: string,
    userId: string,
    message: string,
    apiKeyId?: string
  ): AsyncGenerator<StreamChunk> {
    const context = this.getOrCreateContext(channel, userId, apiKeyId);
    const orchestrator = this.createOrchestrator(context);

    yield* orchestrator.run(message);

    this.memoryStore.syncContext(context);
    if (context.metadata) {
      this.memoryStore.updateSessionMetadata(
        context.sessionId,
        context.metadata
      );
    }
  }

  clearSession(channel: string, userId: string): void {
    this.sessions.delete(`${channel}:${userId}`);
  }

  private getOrCreateContext(
    channel: string,
    userId: string,
    apiKeyId?: string
  ): AgentContext {
    const key = `${channel}:${userId}`;
    let context = this.sessions.get(key);
    if (context) return context;

    const session = this.memoryStore.getOrCreateSession(
      channel,
      userId,
      apiKeyId
    );
    context = this.memoryStore.createContext(session);
    this.sessions.set(key, context);
    return context;
  }
}
