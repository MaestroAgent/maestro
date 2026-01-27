export interface WebSocketEvent {
  type: 'log' | 'cost' | 'message' | 'session' | 'heartbeat';
  data: unknown;
  timestamp: string;
}

type EventHandler = (event: WebSocketEvent) => void;

const API_KEY_STORAGE_KEY = 'maestro_api_key';

class WebSocketClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(url: string = `ws://${window.location.host}/ws`) {
    this.baseUrl = url;
  }

  private getUrl(): string {
    const apiKey = typeof window !== 'undefined' && window.localStorage
      ? localStorage.getItem(API_KEY_STORAGE_KEY)
      : null;

    if (apiKey) {
      const separator = this.baseUrl.includes('?') ? '&' : '?';
      return `${this.baseUrl}${separator}token=${encodeURIComponent(apiKey)}`;
    }

    return this.baseUrl;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.getUrl());

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connected', { type: 'session', data: { event: 'connected' }, timestamp: new Date().toISOString() });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          this.emit(data.type, data);
          this.emit('*', data);
        } catch {
          console.error('Failed to parse WebSocket message:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.emit('disconnected', { type: 'session', data: { event: 'disconnected' }, timestamp: new Date().toISOString() });
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: WebSocketEvent): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
export default wsClient;
