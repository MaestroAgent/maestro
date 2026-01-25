// In production (served from /dashboard/), API is at origin root
// In development (Vite proxy), API is also at root
const API_BASE = '';

export interface Session {
  id: string;
  channel: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Agent {
  name: string;
  description: string;
  model: string;
  tools: string[];
  isDynamic: boolean;
}

export interface AgentDetails {
  name: string;
  description: string;
  model: {
    provider: string;
    name: string;
    temperature: number;
    maxTokens: number;
  };
  tools: string[];
  isDynamic: boolean;
}

export interface BudgetStatus {
  dailySpent: number;
  dailyLimit: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
  date: string;
}

export interface CostSummary {
  today: {
    spent: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };
  history: Array<{
    date: string;
    cost: number;
    requests: number;
  }>;
  bySessions: Array<{
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    requests: number;
  }>;
}

export interface LogEvent {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  sessionId?: string;
  agentName?: string;
  [key: string]: unknown;
}

export interface ChatResponse {
  sessionId: string;
  response: string;
}

export interface StreamEvent {
  event: 'text' | 'tool_call' | 'done' | 'error';
  data: string;
}

class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Sessions
  async getSessions(channel?: string): Promise<{ sessions: Session[] }> {
    const params = channel ? `?channel=${encodeURIComponent(channel)}` : '';
    return this.fetch(`/sessions${params}`);
  }

  async getSession(id: string): Promise<Session> {
    return this.fetch(`/sessions/${id}`);
  }

  async getSessionMessages(
    id: string,
    limit = 50,
    offset = 0
  ): Promise<{
    sessionId: string;
    messages: Message[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    return this.fetch(`/sessions/${id}/messages?limit=${limit}&offset=${offset}`);
  }

  async deleteSession(id: string): Promise<{ success: boolean }> {
    return this.fetch(`/sessions/${id}`, { method: 'DELETE' });
  }

  // Agents
  async getAgents(): Promise<{ agents: Agent[] }> {
    return this.fetch('/agents');
  }

  async getAgent(name: string): Promise<AgentDetails> {
    return this.fetch(`/agents/${encodeURIComponent(name)}`);
  }

  // Chat
  async chat(message: string, sessionId?: string): Promise<ChatResponse> {
    return this.fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId, stream: false }),
    });
  }

  async *chatStream(
    message: string,
    sessionId?: string
  ): AsyncGenerator<StreamEvent> {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const event = line.slice(7);
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith('data: ')) {
            yield { event: event as StreamEvent['event'], data: dataLine.slice(6) };
          }
        }
      }
    }
  }

  async clearSession(sessionId: string): Promise<{ success: boolean }> {
    return this.fetch(`/chat/${sessionId}`, { method: 'DELETE' });
  }

  // Observability
  async getBudget(): Promise<BudgetStatus> {
    return this.fetch('/observability/budget');
  }

  async getCosts(): Promise<CostSummary> {
    return this.fetch('/observability/costs');
  }

  async getLogEvents(tail = 50): Promise<{ events: LogEvent[] }> {
    return this.fetch(`/observability/events?tail=${tail}`);
  }

  async overrideBudget(durationMinutes = 60): Promise<{ success: boolean; message: string }> {
    return this.fetch('/observability/budget/override', {
      method: 'POST',
      body: JSON.stringify({ durationMinutes }),
    });
  }
}

export const api = new APIClient();
export default api;
