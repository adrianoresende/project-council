import { useEffect, useState } from "react";
import {
  IconLogout2,
  IconMenu2,
  IconMessagePlus,
  IconRocket,
  IconShieldLock,
  IconUserCircle,
} from "@tabler/icons-react";
import Sidebar from "../../components/sidebar/sidebar";
import ChatInterface from "../../components/chat-interface/chat-interface";
import FeedbackModal from "../../components/feedback/feedback-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "../../components/ui/sheet";
import PricingPage from "../pricing/page";
import AccountPage from "../account/account-page";
import AdminPage from "../admin/page";
import { useI18n } from "../../i18n";

function getUserInitial(email) {
  if (typeof email !== "string") return "?";
  const normalized = email.trim();
  if (!normalized) return "?";
  return normalized[0].toUpperCase();
}

export default function ChatPage({
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
  userRole,
  onLogout,
  conversation,
  onSendMessage,
  onCancelMessage,
  canCancelMessage,
  isLoading,
}) {
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const { t } = useI18n();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const userInitial = getUserInitial(userEmail);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobileSidebarOpen]);

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const handleChangeMainView = (view) => {
    closeMobileSidebar();
    onChangeMainView(view);
  };

  const handleSelectConversation = (conversationId) => {
    closeMobileSidebar();
    onSelectConversation(conversationId);
  };

  const handleNewConversation = () => {
    closeMobileSidebar();
    onNewConversation();
  };

  const handleLogout = () => {
    closeMobileSidebar();
    onLogout();
  };

  const handleOpenFeedback = () => {
    closeMobileSidebar();
    setIsFeedbackModalOpen(true);
  };

  const renderMainView = () => {
    if (mainView === "pricing") return <PricingPage />;
    if (mainView === "account") return <AccountPage />;
    if (mainView === "admin") return <AdminPage />;
    return (
      <ChatInterface
        conversation={conversation}
        onSendMessage={onSendMessage}
        onCancelMessage={onCancelMessage}
        canCancelMessage={canCancelMessage}
        isLoading={isLoading}
        userPlan={userPlan}
      />
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800">
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      <Sheet
        open={isMobileSidebarOpen}
        onOpenChange={(open) => setIsMobileSidebarOpen(open)}
      >
        <SheetContent
          side="left"
          showCloseButton={false}
          overlayClassName="bg-slate-950/25 backdrop-blur-none lg:hidden"
          className="w-[min(86vw,320px)] max-w-none gap-0 border-r border-slate-200 bg-slate-50 p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">{t("sidebar.openMenu")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("common.appName")}
          </SheetDescription>
          <Sidebar
            mainView={mainView}
            onChangeMainView={handleChangeMainView}
            conversations={conversations}
            isConversationsLoading={isConversationsLoading}
            conversationListTab={conversationListTab}
            onChangeConversationTab={onChangeConversationTab}
            onArchiveConversation={onArchiveConversation}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            canCreateConversation={canCreateConversation}
            createConversationDisabledReason={createConversationDisabledReason}
            credits={credits}
            accountMessage={accountMessage}
            userPlan={userPlan}
            className="h-full w-full border-r-0 shadow-none"
            showMobileCloseButton
            onCloseMobile={closeMobileSidebar}
          />
        </SheetContent>
      </Sheet>

      <div className="hidden lg:block">
        <Sidebar
          mainView={mainView}
          onChangeMainView={handleChangeMainView}
          conversations={conversations}
          isConversationsLoading={isConversationsLoading}
          conversationListTab={conversationListTab}
          onChangeConversationTab={onChangeConversationTab}
          onArchiveConversation={onArchiveConversation}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          canCreateConversation={canCreateConversation}
          createConversationDisabledReason={createConversationDisabledReason}
          credits={credits}
          accountMessage={accountMessage}
          userPlan={userPlan}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="relative flex h-16 items-center justify-between px-3 sm:px-5">
            <div className="flex w-24 items-center">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 lg:hidden"
                aria-label={t("sidebar.openMenu")}
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <IconMenu2 size={18} />
              </button>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
              <div className="text-[21px] font-semibold leading-none text-slate-900">
                {t("common.appName")}
              </div>
            </div>

            <div className="flex w-24 items-center justify-end gap-2 sm:w-40">
              {userPlan === "free" && (
                <button
                  type="button"
                  className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-200 hover:text-slate-900"
                  onClick={() => handleChangeMainView("pricing")}
                >
                  {t("sidebar.upgradeButton")}
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-900 bg-slate-900 text-xs font-semibold text-white transition-colors hover:border-black hover:bg-black"
                    aria-label={t("sidebar.accountTab")}
                  >
                    {userInitial}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56">
                  <DropdownMenuLabel>
                    <div className="truncate text-xs font-medium text-slate-500">
                      {userEmail}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-700">
                      {(userPlan || "free").toUpperCase()}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userRole === "admin" && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => handleChangeMainView("admin")}
                    >
                      <IconShieldLock size={14} stroke={2} />
                      {t("sidebar.adminTab")}
                    </DropdownMenuItem>
                  )}
                  {userPlan === "free" && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => handleChangeMainView("pricing")}
                    >
                      <IconRocket size={14} stroke={2} />
                      {t("sidebar.upgradeProButton")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => handleChangeMainView("account")}
                  >
                    <IconUserCircle size={14} stroke={2} />
                    {t("sidebar.accountTab")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={handleOpenFeedback}
                  >
                    <IconMessagePlus size={14} stroke={2} />
                    {t("sidebar.sendFeedbackButton")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    variant="destructive"
                    onSelect={handleLogout}
                  >
                    <IconLogout2 size={14} stroke={2} />
                    {t("sidebar.logoutButton")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1">{renderMainView()}</div>
      </div>
    </div>
  );
}
