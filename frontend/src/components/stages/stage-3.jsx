import ReactMarkdown from "react-markdown";
import { useI18n } from "../../i18n";
import { IconCheck } from "@tabler/icons-react";

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

export default function Stage3({ finalResponse, className = "" }) {
  const { language, t } = useI18n();
  if (!finalResponse) {
    return null;
  }

  return (
    <div className={`mt-6 ${className}`.trim()}>
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
        {t("stage.stage3Title")}
        <IconCheck size={16} className="text-green-500" />
      </h3>
      <div className="mt-2 mb-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3 font-mono text-xs text-slate-400">
          <div>
            {t("stage.chairmanLabel")}:{" "}
            {finalResponse.model.split("/")[1] || finalResponse.model}
          </div>
          <div>{formatUsage(finalResponse.usage, t, language)}</div>
        </div>
        <div className="markdown-content text-xs leading-relaxed text-slate-800">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
