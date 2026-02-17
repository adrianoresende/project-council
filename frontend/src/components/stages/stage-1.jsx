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

function getShortModelName(model) {
  if (typeof model !== "string" || !model) return "Unknown";
  return model.split("/")[1] || model;
}

export default function Stage1({ responses, className = "" }) {
  const { language, t } = useI18n();
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  const boundedActiveTab = Math.min(activeTab, responses.length - 1);
  const activeResponse = responses[boundedActiveTab];
  const options = responses.map((resp, index) => ({
    label: getShortModelName(resp?.model),
    value: String(index),
  }));

  return (
    <div className={`${className}`.trim()}>
      <h3 className="mb-4 text-base font-semibold text-slate-800">
        {t("stage.stage1Title")}
      </h3>

      <UiSelect
        id="stage-1-model-select"
        name="stage-1-model-select"
        value={String(boundedActiveTab)}
        options={options}
        ariaLabel={t("stage.stage1Title")}
        className="mt-0"
        onChange={(event) => {
          const selectedIndex = Number(event.target.value);
          if (Number.isNaN(selectedIndex)) return;
          setActiveTab(selectedIndex);
        }}
      />

      <div className="mt-2 mb-5 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3 font-mono text-xs text-slate-400">
          <div>{activeResponse?.model || "-"}</div>
          <div>{formatUsage(activeResponse?.usage, t, language)}</div>
        </div>
        <div className="markdown-content text-xs leading-relaxed text-slate-800">
          <ReactMarkdown>{activeResponse?.response || ""}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
