import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { LogEvent } from '../lib/api';
import wsClient from '../lib/websocket';
import type { WebSocketEvent } from '../lib/websocket';

export function useSessions(channel?: string) {
  return useQuery({
    queryKey: ['sessions', channel],
    queryFn: () => api.getSessions(channel),
    refetchInterval: 30000,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id),
    enabled: !!id,
  });
}

export function useSessionMessages(id: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['session-messages', id, limit, offset],
    queryFn: () => api.getSessionMessages(id, limit, offset),
    enabled: !!id,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
  });
}

export function useAgent(name: string) {
  return useQuery({
    queryKey: ['agent', name],
    queryFn: () => api.getAgent(name),
    enabled: !!name,
  });
}

export function useBudget() {
  return useQuery({
    queryKey: ['budget'],
    queryFn: () => api.getBudget(),
    refetchInterval: 60000,
  });
}

export function useCosts() {
  return useQuery({
    queryKey: ['costs'],
    queryFn: () => api.getCosts(),
    refetchInterval: 60000,
  });
}

export function useOverrideBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (durationMinutes?: number) => api.overrideBudget(durationMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useLogEvents(tail = 100) {
  return useQuery({
    queryKey: ['log-events', tail],
    queryFn: () => api.getLogEvents(tail),
    refetchInterval: 10000,
  });
}

export function useChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = useCallback(async (message: string, existingSessionId?: string) => {
    setIsStreaming(true);
    setStreamedText('');

    try {
      const response = await api.chat(message, existingSessionId || undefined);
      setStreamedText(response.response);
      setSessionId(response.sessionId);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      return response;
    } finally {
      setIsStreaming(false);
    }
  }, [queryClient]);

  const clearSession = useCallback(async () => {
    if (sessionId) {
      await api.clearSession(sessionId);
      setSessionId(null);
      setStreamedText('');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  }, [sessionId, queryClient]);

  return {
    sendMessage,
    clearSession,
    isStreaming,
    streamedText,
    sessionId,
    setSessionId,
  };
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    wsClient.connect();

    const unsubConnected = wsClient.on('connected', () => {
      setIsConnected(true);
    });

    const unsubDisconnected = wsClient.on('disconnected', () => {
      setIsConnected(false);
    });

    const unsubAll = wsClient.on('*', (event) => {
      setLastEvent(event);

      // Invalidate queries based on event type
      if (event.type === 'message') {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['session-messages'] });
      } else if (event.type === 'cost') {
        queryClient.invalidateQueries({ queryKey: ['budget'] });
        queryClient.invalidateQueries({ queryKey: ['costs'] });
      } else if (event.type === 'log') {
        queryClient.invalidateQueries({ queryKey: ['log-events'] });
      }
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubAll();
      wsClient.disconnect();
    };
  }, [queryClient]);

  return { isConnected, lastEvent };
}

export function useLiveLogEvents(initialTail = 100) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const { data: initialData } = useLogEvents(initialTail);

  useEffect(() => {
    if (initialData?.events) {
      setEvents(initialData.events);
    }
  }, [initialData]);

  useEffect(() => {
    const unsub = wsClient.on('log', (event) => {
      setEvents((prev) => [...prev.slice(-499), event.data as LogEvent]);
    });
    return unsub;
  }, []);

  return events;
}
