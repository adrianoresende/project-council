import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useI18n } from "../../i18n";
import UiSelect from "../ui/select";

function formatUsage(usage, t, language) {
  if (!usage || typeof usage !== "object") return null;

  const totalTokens = Number(usage.total_tokens ?? 0);
  const cost = Number(usage.cost ?? usage.total_cost ?? 0);
  const parts = [
    t("common.usageTokens", { count: totalTokens.toLocaleString(language) }),
  ];

  if (Number.isFinite(cost) && cost > 0) {
    parts.push(`$${cost.toFixed(6)}`);
  }

  return parts.join(" · ");
}

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "Response X" with the actual model name
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = model.split("/")[1] || model;
    result = result.replace(new RegExp(label, "g"), `**${modelShortName}**`);
  });
  return result;
}

function getShortModelName(model) {
  if (typeof model !== "string" || !model) return "Unknown";
  return model.split("/")[1] || model;
}

export default function Stage2({
  rankings,
  labelToModel,
  aggregateRankings,
  className = "",
}) {
  const { language, t } = useI18n();
  const [activeTab, setActiveTab] = useState(0);

  if (!rankings || rankings.length === 0) {
    return null;
  }

  const boundedActiveTab = Math.min(activeTab, rankings.length - 1);
  const activeRanking = rankings[boundedActiveTab];
  const options = rankings.map((rank, index) => ({
    label: getShortModelName(rank?.model),
    value: String(index),
  }));

  return (
    <div className={`mt-6 ${className}`.trim()}>
      <h3 className="mb-4 text-base font-semibold text-slate-800">
        {t("stage.stage2Title")}
      </h3>

      <h4 className="mb-2 text-sm font-semibold text-slate-800">
        {t("stage.rawEvaluationsTitle")}
      </h4>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-500">
        {t("stage.rawEvaluationsDescription")}
      </p>

      <UiSelect
        id="stage-2-model-select"
        name="stage-2-model-select"
        value={String(boundedActiveTab)}
        options={options}
        ariaLabel={t("stage.stage2Title")}
        className="mt-0"
        onChange={(event) => {
          const selectedIndex = Number(event.target.value);
          if (Number.isNaN(selectedIndex)) return;
          setActiveTab(selectedIndex);
        }}
      />

      <div className="mt-2 mb-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3 font-mono text-xs text-slate-400">
          <div>{activeRanking?.model || "-"}</div>
          <div>{formatUsage(activeRanking?.usage, t, language)}</div>
        </div>
        <div className="markdown-content text-xs leading-relaxed text-slate-800">
          <ReactMarkdown>
            {deAnonymizeText(activeRanking?.ranking || "", labelToModel)}
          </ReactMarkdown>
        </div>
      </div>

      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3 text-[15px] font-semibold">
            {t("stage.aggregateRankingsTitle")}
          </h4>
          <p className="mb-3 text-[13px] leading-relaxed text-slate-500">
            {t("stage.aggregateRankingsDescription")}
          </p>
          <div className="bg-white rounded-md border border-slate-200">
            {aggregateRankings.map((agg, index) => (
              <div
                key={index}
                className="flex text-xs items-center gap-2 py-2 px-2.5"
              >
                <span className="min-w-[12px] font-bold text-slate-400">
                  #{index + 1}
                </span>
                <span className="flex-1 font-mono font-medium">
                  {agg.model.split("/")[1] || agg.model}
                </span>
                <span className="text-slate-500 font-semibold">
                  {t("common.averagePrefix")}: {agg.average_rank.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
