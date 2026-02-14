import Tooltip from '../tooltip/tooltip';
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
  createConversationDisabledReason,
  credits,
  accountMessage,
  userEmail,
  userPlan,
  onLogout,
}) {
  const quotaLabel =
    userPlan === 'pro'
      ? `${credits === 1 ? 'token' : 'tokens'} left`
      : `${credits === 1 ? 'query' : 'queries'} left`;

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
        <Tooltip
          className="new-conversation-tooltip"
          content={createConversationDisabledReason}
          disabled={canCreateConversation || !createConversationDisabledReason}
        >
          <span className="new-conversation-btn-wrap">
            <button
              className="new-conversation-btn"
              onClick={onNewConversation}
              disabled={!canCreateConversation}
            >
              + New Conversation
            </button>
          </span>
        </Tooltip>
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
            {credits.toLocaleString()} {quotaLabel}
          </span>
          <button
            type="button"
            className="sidebar-upgrade-link"
            onClick={() => onChangeMainView('pricing')}
          >
            Upgrade
          </button>
        </div>
        {accountMessage && <div className="account-message">{accountMessage}</div>}
      </div>
    </div>
  );
}
