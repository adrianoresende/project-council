import ReactMarkdown from 'react-markdown';
import './stage-3.css';

function formatUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const totalTokens = Number(usage.total_tokens ?? 0);
  const cost = Number(usage.cost ?? usage.total_cost ?? 0);
  const parts = [`${totalTokens.toLocaleString()} tokens`];

  if (Number.isFinite(cost) && cost > 0) {
    parts.push(`$${cost.toFixed(6)}`);
  }

  return parts.join(' · ');
}

export default function Stage3({ finalResponse }) {
  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <h3 className="stage-title">Stage 3: Final Council Answer</h3>
      <div className="final-response">
        <div className="chairman-header">
          <div className="chairman-label">
            Chairman: {finalResponse.model.split('/')[1] || finalResponse.model}
          </div>
          <div className="usage-pill">
            {formatUsage(finalResponse.usage)}
          </div>
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
