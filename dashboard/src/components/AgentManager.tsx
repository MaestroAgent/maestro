import { useAgents } from '../hooks/useAPI';

export function AgentManager() {
  const { data, isLoading } = useAgents();

  if (isLoading) {
    return <div className="loading">Loading agents...</div>;
  }

  if (!data?.agents.length) {
    return <div className="empty-state">No agents configured</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Agents</h2>
      </div>
      <div className="panel-content">
        <div className="agent-list">
          {data.agents.map((agent) => (
            <div key={agent.name} className="agent-card">
              <div className="agent-card-header">
                <span className="agent-card-name">{agent.name}</span>
                <span className={`agent-card-badge ${agent.isDynamic ? 'dynamic' : ''}`}>
                  {agent.isDynamic ? 'Dynamic' : 'Static'}
                </span>
              </div>
              <div className="agent-card-description">{agent.description}</div>
              <div className="agent-card-tools">
                {agent.tools.map((tool) => (
                  <span key={tool} className="agent-card-tool">
                    {tool}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Model: {agent.model}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
