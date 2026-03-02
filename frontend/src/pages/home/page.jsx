import { useState } from 'react';
import Sidebar from '../../components/sidebar/sidebar';
import ChatInterface from '../../components/chat-interface/chat-interface';
import FeedbackModal from '../../components/feedback/feedback-modal';
import PricingPage from '../pricing/page';
import AccountPage from '../account/account-page';
import AdminPage from '../admin/page';

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800">
      <Sidebar
        mainView={mainView}
        onChangeMainView={onChangeMainView}
        conversations={conversations}
        isConversationsLoading={isConversationsLoading}
        conversationListTab={conversationListTab}
        onChangeConversationTab={onChangeConversationTab}
        onArchiveConversation={onArchiveConversation}
        currentConversationId={currentConversationId}
        onSelectConversation={onSelectConversation}
        onNewConversation={onNewConversation}
        canCreateConversation={canCreateConversation}
        createConversationDisabledReason={createConversationDisabledReason}
        credits={credits}
        accountMessage={accountMessage}
        userEmail={userEmail}
        userPlan={userPlan}
        userRole={userRole}
        onOpenFeedback={() => setIsFeedbackModalOpen(true)}
        onLogout={onLogout}
      />
      {mainView === 'pricing' ? (
        <PricingPage />
      ) : mainView === 'account' ? (
        <AccountPage />
      ) : mainView === 'admin' ? (
        <AdminPage />
      ) : (
        <ChatInterface
          conversation={conversation}
          onSendMessage={onSendMessage}
          onCancelMessage={onCancelMessage}
          canCancelMessage={canCancelMessage}
          isLoading={isLoading}
          userPlan={userPlan}
        />
      )}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />
    </div>
  );
}
