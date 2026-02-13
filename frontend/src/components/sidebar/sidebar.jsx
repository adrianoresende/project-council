import { useState } from 'react';
import './sidebar.css';

function formatConversationDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
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
  credits,
  onAddCredits,
  isAddingCredits,
  accountMessage,
  userEmail,
  userPlan,
  onLogout,
}) {
  const [creditInput, setCreditInput] = useState('1');

  const handleAddCredits = async (event) => {
    event.preventDefault();
    const amount = Number.parseInt(creditInput, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    await onAddCredits(amount);
    setCreditInput('1');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>LLM Council</h1>
        <div className="sidebar-main-tabs">
          <button
            type="button"
            className={`sidebar-main-tab ${mainView === 'chat' ? 'active' : ''}`}
            onClick={() => onChangeMainView('chat')}
          >
            Chats
          </button>
          <button
            type="button"
            className={`sidebar-main-tab ${mainView === 'pricing' ? 'active' : ''}`}
            onClick={() => onChangeMainView('pricing')}
          >
            Pricing
          </button>
          <button
            type="button"
            className={`sidebar-main-tab ${mainView === 'account' ? 'active' : ''}`}
            onClick={() => onChangeMainView('account')}
          >
            Account
          </button>
        </div>
        <button
          className="new-conversation-btn"
          onClick={onNewConversation}
          disabled={!canCreateConversation}
          title={canCreateConversation ? 'Create a new conversation' : 'No credits available'}
        >
          + New Conversation
        </button>
      </div>

      <div className="conversation-list">
        {isConversationsLoading ? (
          <div className="conversation-loading">Loading conversations...</div>
        ) : conversations.length === 0 ? (
          <div className="no-conversations">
            {conversationListTab === 'arquived'
              ? 'No arquived conversations'
              : 'No conversations yet'}
          </div>
        ) : (
          conversations.map((conv) => {
            const createdAtText = formatConversationDate(conv.created_at);
            const archiveLabel =
              conversationListTab === 'arquived' ? 'Unarquive' : 'Arquive';
            return (
              <div
                key={conv.id}
                className={`conversation-item ${
                  conv.id === currentConversationId ? 'active' : ''
                }`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="conversation-title">
                  {conv.title || 'New Conversation'}
                </div>
                {createdAtText && (
                  <div className="conversation-date">{createdAtText}</div>
                )}
                <div className="conversation-actions">
                  <button
                    type="button"
                    className="conversation-action-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchiveConversation(
                        conv.id,
                        conversationListTab !== 'arquived'
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

      <div className="conversation-tabs">
        <button
          type="button"
          className={`conversation-tab ${conversationListTab === 'chats' ? 'active' : ''}`}
          onClick={() => onChangeConversationTab('chats')}
        >
          Chats
        </button>
        <button
          type="button"
          className={`conversation-tab ${conversationListTab === 'arquived' ? 'active' : ''}`}
          onClick={() => onChangeConversationTab('arquived')}
        >
          Arquived
        </button>
      </div>

      <div className="sidebar-footer">
        <div className="credits-panel">
          <div className="credits-top-row">
            <span className="credits-label">Credits</span>
            <span className="credits-value">{credits}</span>
          </div>
          <form className="credits-form" onSubmit={handleAddCredits}>
            <input
              type="number"
              min="1"
              step="1"
              value={creditInput}
              onChange={(event) => setCreditInput(event.target.value)}
              className="credits-input"
              disabled={isAddingCredits}
            />
            <button type="submit" className="add-credits-btn" disabled={isAddingCredits}>
              {isAddingCredits ? 'Adding...' : 'Add Credit'}
            </button>
          </form>
          {accountMessage && <div className="account-message">{accountMessage}</div>}
        </div>
        <div className="sidebar-user-row">
          <div className="sidebar-user-meta">
            <span className="sidebar-user-email">{userEmail}</span>
            <span className={`sidebar-user-plan ${userPlan === 'pro' ? 'pro' : 'free'}`}>
              {(userPlan || 'free').toUpperCase()}
            </span>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
        <div className="sidebar-billing-row">
          <span className="sidebar-credits-left">
            {credits} {credits === 1 ? 'credit' : 'credits'} left
          </span>
          <button
            type="button"
            className="sidebar-upgrade-link"
            onClick={() => onChangeMainView('pricing')}
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}
