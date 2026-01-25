import { useBudget, useCosts, useOverrideBudget } from '../hooks/useAPI';

export function CostDashboard() {
  const { data: budget, isLoading: budgetLoading } = useBudget();
  const { data: costs, isLoading: costsLoading } = useCosts();
  const overrideBudget = useOverrideBudget();

  if (budgetLoading || costsLoading) {
    return <div className="loading">Loading cost data...</div>;
  }

  const getProgressClass = (percent: number) => {
    if (percent >= 100) return 'error';
    if (percent >= 80) return 'warning';
    return '';
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Costs & Budget</h2>
        {budget?.isExceeded && (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => overrideBudget.mutate(60)}
            disabled={overrideBudget.isPending}
          >
            Override (1hr)
          </button>
        )}
      </div>
      <div className="panel-content">
        {budget && (
          <>
            <div className="cost-grid">
              <div className="cost-card">
                <div className="cost-card-label">Today's Spending</div>
                <div className={`cost-card-value ${getProgressClass(budget.percentUsed)}`}>
                  ${budget.dailySpent.toFixed(4)}
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-bar-fill ${getProgressClass(budget.percentUsed)}`}
                    style={{ width: `${Math.min(budget.percentUsed, 100)}%` }}
                  />
                </div>
              </div>

              <div className="cost-card">
                <div className="cost-card-label">Daily Limit</div>
                <div className="cost-card-value">${budget.dailyLimit.toFixed(2)}</div>
              </div>

              <div className="cost-card">
                <div className="cost-card-label">Remaining</div>
                <div className={`cost-card-value ${budget.remaining <= 0 ? 'error' : ''}`}>
                  ${budget.remaining.toFixed(4)}
                </div>
              </div>

              <div className="cost-card">
                <div className="cost-card-label">Usage</div>
                <div className={`cost-card-value ${getProgressClass(budget.percentUsed)}`}>
                  {budget.percentUsed.toFixed(1)}%
                </div>
              </div>
            </div>

            {budget.isExceeded && (
              <div
                style={{
                  padding: '1rem',
                  background: 'var(--error)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  color: 'white',
                }}
              >
                Daily budget limit exceeded. Override or wait until tomorrow.
              </div>
            )}
          </>
        )}

        {costs?.history && costs.history.length > 0 && (
          <>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>Spending History</h3>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cost</th>
                  <th>Requests</th>
                </tr>
              </thead>
              <tbody>
                {costs.history.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>${day.cost.toFixed(4)}</td>
                    <td>{day.requests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
