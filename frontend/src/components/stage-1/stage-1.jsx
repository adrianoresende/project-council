import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './stage-1.css';

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

export default function Stage1({ responses }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split('/')[1] || resp.model}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="model-header">
          <div className="model-name">{responses[activeTab].model}</div>
          <div className="usage-pill">
            {formatUsage(responses[activeTab].usage)}
          </div>
        </div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{responses[activeTab].response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
