import Sidebar from '../../components/sidebar/sidebar';
import ChatInterface from '../../components/chat-interface/chat-interface';
import PricingPage from '../pricing/page';
import AccountPage from '../account/account-page';

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
  onLogout,
  conversation,
  onSendMessage,
  isLoading,
}) {
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
        onLogout={onLogout}
      />
      {mainView === 'pricing' ? (
        <PricingPage />
      ) : mainView === 'account' ? (
        <AccountPage onGoToPricing={() => onChangeMainView('pricing')} />
      ) : (
        <ChatInterface
          conversation={conversation}
          onSendMessage={onSendMessage}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
