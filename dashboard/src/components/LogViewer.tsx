import { useLiveLogEvents } from '../hooks/useAPI';

export function LogViewer() {
  const events = useLiveLogEvents(100);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogMessage = (event: Record<string, unknown>): string => {
    if (event.input) return String(event.input).slice(0, 100);
    if (event.toolName) return String(event.toolName);
    if (event.error) return String(event.error);
    if (event.message) return String(event.message);
    if (event.inputTokens !== undefined) {
      return `${event.inputTokens}/${event.outputTokens} tokens, ${event.durationMs}ms`;
    }
    return '';
  };

  if (!events.length) {
    return <div className="empty-state">No log events yet</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Live Logs</h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {events.length} events
        </span>
      </div>
      <div className="panel-content log-container">
        {events.map((event, index) => (
          <div key={index} className="log-entry">
            <span className="log-time">{formatTime(event.timestamp)}</span>
            <span className={`log-level ${event.level}`}>{event.level}</span>
            <span className="log-event">{event.event}</span>
            <span className="log-message">{getLogMessage(event as Record<string, unknown>)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
