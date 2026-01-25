import { useSessions, useDeleteSession } from '../hooks/useAPI';
import { Trash2 } from 'lucide-react';

interface SessionBrowserProps {
  selectedSessionId?: string;
  onSelectSession: (sessionId: string) => void;
}

export function SessionBrowser({ selectedSessionId, onSelectSession }: SessionBrowserProps) {
  const { data, isLoading } = useSessions();
  const deleteSession = useDeleteSession();

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return <div className="loading">Loading sessions...</div>;
  }

  if (!data?.sessions.length) {
    return <div className="empty-state">No sessions yet</div>;
  }

  return (
    <ul className="session-list">
      {data.sessions.map((session) => (
        <li
          key={session.id}
          className={`session-item ${selectedSessionId === session.id ? 'active' : ''}`}
          onClick={() => onSelectSession(session.id)}
        >
          <div className="session-item-header">
            <span className="session-item-channel">{session.channel}</span>
            <span className="session-item-time">{formatTime(session.updatedAt)}</span>
          </div>
          <div className="session-item-preview">
            {session.messageCount} messages
          </div>
          <button
            className="btn btn-sm btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              deleteSession.mutate(session.id);
            }}
            style={{ marginTop: '0.5rem' }}
          >
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
