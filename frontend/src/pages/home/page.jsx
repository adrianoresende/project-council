import Sidebar from '../../components/sidebar/sidebar';
import ChatInterface from '../../components/chat-interface/chat-interface';

export default function ChatPage({
  conversations,
  isConversationsLoading,
  conversationListTab,
  onChangeConversationTab,
  onArchiveConversation,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  canCreateConversation,
  credits,
  onAddCredits,
  isAddingCredits,
  accountMessage,
  userEmail,
  onLogout,
  conversation,
  onSendMessage,
  isLoading,
}) {
  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        isConversationsLoading={isConversationsLoading}
        conversationListTab={conversationListTab}
        onChangeConversationTab={onChangeConversationTab}
        onArchiveConversation={onArchiveConversation}
        currentConversationId={currentConversationId}
        onSelectConversation={onSelectConversation}
        onNewConversation={onNewConversation}
        canCreateConversation={canCreateConversation}
        credits={credits}
        onAddCredits={onAddCredits}
        isAddingCredits={isAddingCredits}
        accountMessage={accountMessage}
        userEmail={userEmail}
        onLogout={onLogout}
      />
      <ChatInterface
        conversation={conversation}
        onSendMessage={onSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}
