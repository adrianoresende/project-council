import { IconX } from "@tabler/icons-react";
import Stage1 from "../stages/stage-1";
import Stage2 from "../stages/stage-2";
import Stage3 from "../stages/stage-3";

function getStageStatus(message, key) {
  if (message?.loading?.[key]) return "running";
  if (message?.[key]) return "completed";
  return "pending";
}

function getStageDetail(message, key, t, language) {
  if (!message) return null;

  if (key === "stage1" && Array.isArray(message.stage1)) {
    return t("chat.stage1ModelResponses", {
      count: message.stage1.length.toLocaleString(language),
    });
  }

  if (key === "stage2" && Array.isArray(message.stage2)) {
    return t("chat.stage2PeerEvaluations", {
      count: message.stage2.length.toLocaleString(language),
    });
  }

  if (key === "stage3" && message.stage3?.response) {
    return t("chat.finalAnswerGenerated");
  }

  return null;
}

function formatUsageTokensOnly(usage, t, language) {
  if (!usage || typeof usage !== "object") return null;
  const totalTokens = Number(usage.total_tokens ?? 0);
  return t("common.usageTokens", {
    count: totalTokens.toLocaleString(language),
  });
}

function StagePlaceholder({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
      {text}
    </div>
  );
}

export default function SidebarRight({ message, language, t, onClose }) {
  if (!message) return null;

  const stages = [
    {
      key: "stage1",
      title: t("chat.stage1Title"),
      description: t("chat.stage1Description"),
    },
    {
      key: "stage2",
      title: t("chat.stage2Title"),
      description: t("chat.stage2Description"),
    },
    {
      key: "stage3",
      title: t("chat.stage3Title"),
      description: t("chat.stage3Description"),
    },
  ].map((stage) => {
    const status = getStageStatus(message, stage.key);
    return {
      ...stage,
      status,
      detail: getStageDetail(message, stage.key, t, language),
    };
  });

  const completedCount = stages.filter(
    (stage) => stage.status === "completed",
  ).length;

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex h-screen w-full max-w-[420px] flex-col border-l border-slate-200 bg-slate-50 shadow-[0_14px_30px_rgba(15,23,42,0.2)] lg:static lg:z-0 lg:w-[380px] lg:max-w-none lg:shrink-0 lg:shadow-none">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.4px] text-slate-500">
            {t("chat.processDetailsTitle")}
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <IconX size={15} />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {t("chat.stageProgress", {
            completed: completedCount.toLocaleString(language),
            total: stages.length.toLocaleString(language),
          })}
        </p>
        {message.metadata?.usage && (
          <p className="mt-1 text-sm text-slate-600">
            {t("chat.turnUsage", {
              value: formatUsageTokensOnly(message.metadata.usage, t, language),
            })}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <ol className="flex flex-col gap-3">
          {stages.map((stage) => (
            <li
              key={stage.key}
              className="rounded-lg border border-slate-200 bg-white p-3.5"
            >
              <div className="flex items-start gap-3">
                {stage.status === "running" ? (
                  <span className="mt-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
                ) : (
                  <span
                    className={`mt-1 size-2 rounded-full ${
                      stage.status === "completed"
                        ? "bg-slate-900"
                        : "bg-slate-300"
                    }`}
                  />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">
                    {stage.title}
                  </div>
                  <div className="text-xs leading-relaxed text-slate-500">
                    {stage.description}
                  </div>
                  {stage.detail && (
                    <div className="mt-1 text-xs font-medium text-slate-700">
                      {stage.detail}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
          {Array.isArray(message.stage1) && message.stage1.length > 0 ? (
            <Stage1 responses={message.stage1} className="my-0" />
          ) : (
            <StagePlaceholder
              text={
                message.loading?.stage1
                  ? t("chat.stage1Processing")
                  : t("chat.stage1NotAvailable")
              }
            />
          )}

          {Array.isArray(message.stage2) && message.stage2.length > 0 ? (
            <Stage2
              rankings={message.stage2}
              labelToModel={message.metadata?.label_to_model}
              aggregateRankings={message.metadata?.aggregate_rankings}
              className="my-0"
            />
          ) : (
            <StagePlaceholder
              text={
                message.loading?.stage2
                  ? t("chat.stage2Processing")
                  : t("chat.stage2NotAvailable")
              }
            />
          )}

          {message.stage3 ? (
            <Stage3 finalResponse={message.stage3} className="my-0" />
          ) : (
            <StagePlaceholder
              text={
                message.loading?.stage3
                  ? t("chat.stage3Processing")
                  : t("chat.stage3NotAvailable")
              }
            />
          )}
        </div>
      </div>
    </aside>
  );
}
