import ReactMarkdown from 'react-markdown';
import { useI18n } from '../../i18n';

function formatUsage(usage, t, language) {
  if (!usage || typeof usage !== 'object') return null;

  const totalTokens = Number(usage.total_tokens ?? 0);
  const cost = Number(usage.cost ?? usage.total_cost ?? 0);
  const parts = [
    t('common.usageTokens', { count: totalTokens.toLocaleString(language) }),
  ];

  if (Number.isFinite(cost) && cost > 0) {
    parts.push(`$${cost.toFixed(6)}`);
  }

  return parts.join(' · ');
}

export default function Stage3({ finalResponse, className = '' }) {
  const { language, t } = useI18n();
  if (!finalResponse) {
    return null;
  }

  return (
    <div className={`my-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 ${className}`.trim()}>
      <h3 className="mb-4 text-base font-semibold text-slate-800">{t('stage.stage3Title')}</h3>
      <div className="rounded-md border border-emerald-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-mono text-xs font-semibold text-emerald-700">
            {t('stage.chairmanLabel')}: {finalResponse.model.split('/')[1] || finalResponse.model}
          </div>
          <div className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs text-emerald-900">
            {formatUsage(finalResponse.usage, t, language)}
          </div>
        </div>
        <div className="markdown-content text-[15px] leading-relaxed text-slate-800">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
