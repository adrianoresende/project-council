import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
    <div className="my-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-4 text-base font-semibold text-slate-800">Stage 1: Individual Responses</h3>

      <div className="mb-4 flex flex-wrap gap-2">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`btn rounded-t-md px-4 py-2 text-sm ${
              activeTab === index
                ? 'border-sky-500 border-b-white bg-white font-semibold text-sky-600'
                : 'border-slate-300 bg-white text-slate-500 hover:border-sky-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split('/')[1] || resp.model}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-mono text-xs text-slate-400">{responses[activeTab].model}</div>
          <div className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs text-blue-900">
            {formatUsage(responses[activeTab].usage)}
          </div>
        </div>
        <div className="markdown-content leading-relaxed text-slate-800">
          <ReactMarkdown>{responses[activeTab].response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
