import Tooltip from "../tooltip/tooltip";
import { useI18n } from "../../i18n";

function formatConversationDate(value, locale) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function Sidebar({
  mainView,
  onChangeMainView,
  conversations,
  isConversationsLoading,
  conversationListTab,
  onChangeConversationTab,
  onArchiveConversation,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  canCreateConversation,
  createConversationDisabledReason,
  credits,
  accountMessage,
  userEmail,
  userPlan,
  onLogout,
}) {
  const { language, t } = useI18n();
  const mainTabClass = (active) =>
    `btn flex-1 px-2.5 py-1.5 text-xs font-bold ${
      active
        ? "border-sky-500 bg-sky-50 text-sky-700"
        : "border-slate-300 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-700"
    }`;

  const listTabClass = (active) =>
    `btn flex-1 px-2.5 py-2 text-xs font-semibold ${
      active
        ? "border-sky-500 bg-sky-50 text-sky-700"
        : "border-slate-300 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-700"
    }`;

  const quotaLabel =
    userPlan === "pro"
      ? credits === 1
        ? t("sidebar.tokenLeftOne")
        : t("sidebar.tokenLeftMany")
      : credits === 1
        ? t("sidebar.queryLeftOne")
        : t("sidebar.queryLeftMany");

  return (
    <aside className="flex h-screen w-[260px] flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 p-4">
        <h1 className="mb-3 text-lg font-semibold text-slate-800">
          {t("common.appName")}
        </h1>
        <div className="mb-2.5 flex gap-2">
          <button
            type="button"
            className={mainTabClass(mainView === "chat")}
            onClick={() => onChangeMainView("chat")}
          >
            {t("sidebar.chatsTab")}
          </button>
          <button
            type="button"
            className={mainTabClass(mainView === "pricing")}
            onClick={() => onChangeMainView("pricing")}
          >
            {t("sidebar.pricingTab")}
          </button>
          <button
            type="button"
            className={mainTabClass(mainView === "account")}
            onClick={() => onChangeMainView("account")}
          >
            {t("sidebar.accountTab")}
          </button>
        </div>
        <Tooltip
          className="w-full"
          content={createConversationDisabledReason}
          disabled={canCreateConversation || !createConversationDisabledReason}
        >
          <span className="block w-full">
            <button
              className="btn w-full border-sky-500 bg-sky-500 px-2.5 py-2.5 text-sm font-medium text-white hover:border-sky-600 hover:bg-sky-600 disabled:opacity-55"
              onClick={onNewConversation}
              disabled={!canCreateConversation}
            >
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
            const createdAtText = formatConversationDate(
              conv.created_at,
              language,
            );
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
                {createdAtText && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    {createdAtText}
                  </div>
                )}
                <div className="mt-2">
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

      <div className="flex gap-2 border-t border-slate-200 p-2">
        <button
          type="button"
          className={listTabClass(conversationListTab === "chats")}
          onClick={() => onChangeConversationTab("chats")}
        >
          {t("sidebar.chatsTab")}
        </button>
        <button
          type="button"
          className={listTabClass(conversationListTab === "arquived")}
          onClick={() => onChangeConversationTab("arquived")}
        >
          {t("sidebar.archivedTab")}
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="max-w-[120px] truncate text-xs text-slate-500">
              {userEmail}
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                userPlan === "pro"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-slate-100 text-slate-600"
              }`}
            >
              {(userPlan || "free").toUpperCase()}
            </span>
          </div>
          <button
            className="btn rounded-md border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            onClick={onLogout}
          >
            {t("sidebar.logoutButton")}
          </button>
        </div>
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
