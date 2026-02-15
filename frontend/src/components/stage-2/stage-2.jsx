import { useState } from 'react';
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

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "Response X" with the actual model name
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = model.split('/')[1] || model;
    result = result.replace(new RegExp(label, 'g'), `**${modelShortName}**`);
  });
  return result;
}

export default function Stage2({
  rankings,
  labelToModel,
  aggregateRankings,
  className = '',
}) {
  const { language, t } = useI18n();
  const [activeTab, setActiveTab] = useState(0);

  if (!rankings || rankings.length === 0) {
    return null;
  }

  return (
    <div className={`my-6 rounded-lg border border-slate-200 bg-slate-50 p-5 ${className}`.trim()}>
      <h3 className="mb-4 text-base font-semibold text-slate-800">{t('stage.stage2Title')}</h3>

      <h4 className="mb-2 text-sm font-semibold text-slate-800">{t('stage.rawEvaluationsTitle')}</h4>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-500">
        {t('stage.rawEvaluationsDescription')}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {rankings.map((rank, index) => (
          <button
            key={index}
            className={`btn rounded-t-md px-4 py-2 text-sm ${
              activeTab === index
                ? 'border-sky-500 border-b-white bg-white font-semibold text-sky-600'
                : 'border-slate-300 bg-white text-slate-500 hover:border-sky-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab(index)}
          >
            {rank.model.split('/')[1] || rank.model}
          </button>
        ))}
      </div>

      <div className="mb-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-mono text-xs text-slate-400">
            {rankings[activeTab].model}
          </div>
          <div className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs text-blue-900">
            {formatUsage(rankings[activeTab].usage, t, language)}
          </div>
        </div>
        <div className="markdown-content text-sm leading-relaxed text-slate-800">
          <ReactMarkdown>
            {deAnonymizeText(rankings[activeTab].ranking, labelToModel)}
          </ReactMarkdown>
        </div>

        {rankings[activeTab].parsed_ranking &&
         rankings[activeTab].parsed_ranking.length > 0 && (
          <div className="mt-4 border-t-2 border-slate-200 pt-4">
            <strong className="text-[13px] text-sky-600">{t('stage.extractedRanking')}</strong>
            <ol>
              {rankings[activeTab].parsed_ranking.map((label, i) => (
                <li key={i} className="my-1 font-mono text-[13px] text-slate-800">
                  {labelToModel && labelToModel[label]
                    ? labelToModel[label].split('/')[1] || labelToModel[label]
                    : label}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="mb-5 rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
          <h4 className="mb-3 text-[15px] font-semibold text-blue-600">{t('stage.aggregateRankingsTitle')}</h4>
          <p className="mb-3 text-[13px] leading-relaxed text-slate-500">
            {t('stage.aggregateRankingsDescription')}
          </p>
          <div className="flex flex-col gap-2">
            {aggregateRankings.map((agg, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-md border border-blue-200 bg-white p-2.5"
              >
                <span className="min-w-[35px] text-base font-bold text-blue-600">#{index + 1}</span>
                <span className="flex-1 font-mono text-sm font-medium text-slate-800">
                  {agg.model.split('/')[1] || agg.model}
                </span>
                <span className="font-mono text-[13px] text-slate-500">
                  {t('common.averagePrefix')}: {agg.average_rank.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400">
                  ({t('common.votes', { count: agg.rankings_count.toLocaleString(language) })})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
