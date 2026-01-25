import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWebSocket } from './hooks/useAPI';
import { Chat } from './components/Chat';
import { SessionBrowser } from './components/SessionBrowser';
import { AgentManager } from './components/AgentManager';
import { LogViewer } from './components/LogViewer';
import { CostDashboard } from './components/CostDashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type Tab = 'chat' | 'agents' | 'logs' | 'costs';

function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const { isConnected } = useWebSocket();

  return (
    <div className="app">
      <header className="header">
        <h1>Maestro Dashboard</h1>
        <div className="header-status">
          <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="panel-header">
            <h2>Sessions</h2>
          </div>
          <SessionBrowser
            selectedSessionId={selectedSessionId}
            onSelectSession={setSelectedSessionId}
          />
        </aside>

        <main className="content">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              Chat
            </button>
            <button
              className={`tab ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
            >
              Agents
            </button>
            <button
              className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              Logs
            </button>
            <button
              className={`tab ${activeTab === 'costs' ? 'active' : ''}`}
              onClick={() => setActiveTab('costs')}
            >
              Costs
            </button>
          </div>

          {activeTab === 'chat' && <Chat sessionId={selectedSessionId} />}
          {activeTab === 'agents' && <AgentManager />}
          {activeTab === 'logs' && <LogViewer />}
          {activeTab === 'costs' && <CostDashboard />}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
