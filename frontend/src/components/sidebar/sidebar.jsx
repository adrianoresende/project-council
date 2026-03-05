import { IconMessagePlus, IconX } from "@tabler/icons-react";
import Tooltip from "../tooltip/tooltip";
import { useI18n } from "../../i18n";

export default function Sidebar({
  onChangeMainView,
  conversations,
  isConversationsLoading,
  conversationListTab,
  onArchiveConversation,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  canCreateConversation,
  createConversationDisabledReason,
  credits,
  accountMessage,
  userPlan,
  className = "",
  showMobileCloseButton = false,
  onCloseMobile,
}) {
  const { language, t } = useI18n();
  const quotaLabel =
    userPlan === "pro"
      ? credits === 1
        ? t("sidebar.tokenLeftOne")
        : t("sidebar.tokenLeftMany")
      : credits === 1
        ? t("sidebar.queryLeftOne")
        : t("sidebar.queryLeftMany");

  return (
    <aside
      className={`flex h-full w-[260px] flex-col border-r border-slate-200 bg-slate-50 ${className}`.trim()}
    >
      <div className="border-b border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-800">
            {t("common.appName")}
          </h1>
          {showMobileCloseButton && (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
              aria-label={t("common.close")}
              onClick={onCloseMobile}
            >
              <IconX size={15} />
            </button>
          )}
        </div>
        <Tooltip
          className="w-full"
          content={createConversationDisabledReason}
          disabled={canCreateConversation || !createConversationDisabledReason}
        >
          <span className="block w-full">
            <button
              className="btn w-full gap-2 border-sky-500 bg-sky-500 px-2.5 py-2.5 text-sm font-medium text-white hover:border-sky-600 hover:bg-sky-600 disabled:opacity-55"
              onClick={onNewConversation}
              disabled={!canCreateConversation}
            >
              <IconMessagePlus size={16} stroke={2.2} />
              {t("sidebar.newConversationButton")}
            </button>
          </span>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isConversationsLoading ? (
          <div className="px-3 py-2.5 text-sm text-slate-500">
            {t("sidebar.loadingConversations")}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-400">
            {conversationListTab === "arquived"
              ? t("sidebar.noArchivedConversations")
              : t("sidebar.noConversations")}
          </div>
        ) : (
          conversations.map((conv) => {
            const archiveLabel =
              conversationListTab === "arquived"
                ? t("sidebar.unarchive")
                : t("sidebar.archive");
            return (
              <div
                key={conv.id}
                className={`mb-1 cursor-pointer rounded-md border px-3 py-2 transition-colors ${
                  conv.id === currentConversationId
                    ? "border-sky-500 bg-sky-50"
                    : "border-transparent hover:bg-slate-100"
                }`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="text-sm text-slate-800">
                  {conv.title || t("sidebar.newConversationTitle")}
                </div>
                <div className="mt-2 hidden">
                  <button
                    type="button"
                    className="btn rounded-md border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchiveConversation(
                        conv.id,
                        conversationListTab !== "arquived",
                      );
                    }}
                  >
                    {archiveLabel}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {credits.toLocaleString(language)} {quotaLabel}
          </span>
          <button
            type="button"
            className="bg-transparent p-0 text-xs font-bold text-sky-700 hover:underline"
            onClick={() => onChangeMainView("pricing")}
          >
            {t("sidebar.upgradeButton")}
          </button>
        </div>
        {accountMessage && (
          <div className="text-xs text-rose-700">{accountMessage}</div>
        )}
      </div>
    </aside>
  );
}
