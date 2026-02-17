import { useEffect, useRef, useState } from "react";
import {
  IconLogout2,
  IconMessagePlus,
  IconShieldLock,
  IconUserCircle,
} from "@tabler/icons-react";
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
  userEmail,
  userPlan,
  userRole,
  onLogout,
}) {
  const { language, t } = useI18n();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
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
        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-2.5 py-2 text-left hover:bg-slate-50"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
          >
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
            <span className="text-[10px] text-slate-500">
              {isUserMenuOpen ? "▲" : "▼"}
            </span>
          </button>

          {isUserMenuOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-md border border-slate-200 bg-white p-1 shadow-[0_8px_20px_rgba(15,23,42,0.1)]">
              {userRole === "admin" && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    onChangeMainView("admin");
                    setIsUserMenuOpen(false);
                  }}
                >
                  <IconShieldLock size={14} stroke={2} />
                  {t("sidebar.adminTab")}
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  onChangeMainView("account");
                  setIsUserMenuOpen(false);
                }}
              >
                <IconUserCircle size={14} stroke={2} />
                {t("sidebar.accountTab")}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  onLogout();
                  setIsUserMenuOpen(false);
                }}
              >
                <IconLogout2 size={14} stroke={2} />
                {t("sidebar.logoutButton")}
              </button>
            </div>
          )}
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
