import { WSContext } from "hono/ws";

export interface WebSocketEvent {
  type: "log" | "cost" | "message" | "session" | "heartbeat";
  data: unknown;
  timestamp: string;
}

export class WebSocketManager {
  private clients: Set<WSContext> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start heartbeat to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: "heartbeat",
        data: { connected: this.clients.size },
        timestamp: new Date().toISOString(),
      });
    }, 30000);
  }

  addClient(ws: WSContext): void {
    this.clients.add(ws);
    // Send welcome message
    this.sendTo(ws, {
      type: "session",
      data: { event: "connected", clientCount: this.clients.size },
      timestamp: new Date().toISOString(),
    });
  }

  removeClient(ws: WSContext): void {
    this.clients.delete(ws);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private sendTo(ws: WSContext, event: WebSocketEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // Client disconnected, will be cleaned up
      this.clients.delete(ws);
    }
  }

  broadcast(event: WebSocketEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        client.send(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  broadcastLog(logEvent: unknown): void {
    this.broadcast({
      type: "log",
      data: logEvent,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastCostUpdate(costData: unknown): void {
    this.broadcast({
      type: "cost",
      data: costData,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastMessage(sessionId: string, message: unknown): void {
    this.broadcast({
      type: "message",
      data: { sessionId, message },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastSessionUpdate(sessionId: string, event: string): void {
    this.broadcast({
      type: "session",
      data: { sessionId, event },
      timestamp: new Date().toISOString(),
    });
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.clients.clear();
  }
}

// Global WebSocket manager instance
let wsManager: WebSocketManager | null = null;

export function initWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}
