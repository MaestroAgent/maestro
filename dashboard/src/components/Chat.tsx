import { useState, useRef, useEffect } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { useChat, useSessionMessages } from '../hooks/useAPI';

interface ChatProps {
  sessionId?: string;
}

export function Chat({ sessionId: initialSessionId }: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, clearSession, isStreaming, sessionId, setSessionId } = useChat();

  // Use initial sessionId if provided
  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId);
    }
  }, [initialSessionId, setSessionId]);

  const { data: messagesData } = useSessionMessages(sessionId || '', 100, 0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const message = input;
    setInput('');
    await sendMessage(message, sessionId || undefined);
  };

  const handleClear = async () => {
    await clearSession();
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messagesData?.messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {isStreaming && (
          <div className="chat-message assistant">
            <span className="loading">Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={isStreaming}>
          <Send size={16} />
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleClear}>
          <Trash2 size={16} />
        </button>
      </form>
    </div>
  );
}
