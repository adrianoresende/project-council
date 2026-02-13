import { useState, useEffect, useCallback, useRef } from 'react';
import AccountAccessPage from './pages/account/page';
import ChatPage from './pages/home/page';
import { api } from './api';
import './App.css';

function getMainViewFromPath(pathname) {
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/account') return 'account';
  return 'chat';
}

function getPathFromMainView(view) {
  if (view === 'pricing') return '/pricing';
  if (view === 'account') return '/account';
  return '/';
}

function normalizePlan(value) {
  if (typeof value !== 'string') return 'free';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pro') return 'pro';
  return 'free';
}

function inferPlanFromUser(user) {
  if (!user) return 'free';
  return normalizePlan(
    user?.user_metadata?.plan
      || user?.app_metadata?.plan
      || 'free'
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [userPlan, setUserPlan] = useState('free');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [mainView, setMainView] = useState(
    getMainViewFromPath(window.location.pathname)
  );
  const [conversations, setConversations] = useState([]);
  const [pendingConversationLoads, setPendingConversationLoads] = useState(0);
  const [conversationListTab, setConversationListTab] = useState('chats');
  const [credits, setCredits] = useState(0);
  const [isAddingCredits, setIsAddingCredits] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestConversationRequestRef = useRef(0);
  const conversationListCacheRef = useRef({
    chats: null,
    arquived: null,
  });

  const clearChatState = useCallback(() => {
    setConversations([]);
    setPendingConversationLoads(0);
    setConversationListTab('chats');
    setCredits(0);
    setIsAddingCredits(false);
    setAccountMessage('');
    setCurrentConversationId(null);
    setCurrentConversation(null);
    setIsLoading(false);
    conversationListCacheRef.current = { chats: null, arquived: null };
  }, []);

  const handleUnauthorized = useCallback(() => {
    api.clearAccessToken();
    setUser(null);
    setUserPlan('free');
    clearChatState();
    window.history.replaceState({}, '', '/');
    setMainView('chat');
  }, [clearChatState]);

  useEffect(() => {
    const onPopState = () => {
      setMainView(getMainViewFromPath(window.location.pathname));
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadConversations = useCallback(async ({
    force = false,
    tab = conversationListTab,
  } = {}) => {
    if (!force) {
      const cached = conversationListCacheRef.current[tab];
      if (Array.isArray(cached)) {
        setConversations(cached);
        return;
      }
    }

    const archived = tab === 'arquived';
    const requestId = latestConversationRequestRef.current + 1;
    latestConversationRequestRef.current = requestId;
    setPendingConversationLoads((count) => count + 1);
    try {
      const convs = await api.listConversations(archived);
      if (latestConversationRequestRef.current !== requestId) {
        return;
      }
      conversationListCacheRef.current[tab] = convs;
      setConversations(convs);
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error('Failed to load conversations:', error);
    } finally {
      setPendingConversationLoads((count) => Math.max(0, count - 1));
    }
  }, [conversationListTab, handleUnauthorized]);

  const loadCredits = useCallback(async () => {
    try {
      const data = await api.getCredits();
      setCredits(data.credits ?? 0);
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error('Failed to load credits:', error);
    }
  }, [handleUnauthorized]);

  const loadAccountSummary = useCallback(async () => {
    try {
      const data = await api.getAccountSummary();
      setUserPlan(normalizePlan(data?.plan));
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error('Failed to load account summary:', error);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const onPlanUpdated = () => {
      loadAccountSummary();
    };

    window.addEventListener('account-plan-updated', onPlanUpdated);
    return () => window.removeEventListener('account-plan-updated', onPlanUpdated);
  }, [loadAccountSummary]);

  const loadConversation = useCallback(async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error('Failed to load conversation:', error);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const bootstrapSession = async () => {
      const token = api.getAccessToken();
      if (!token) {
        setIsAuthLoading(false);
        return;
      }

      try {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
        setUserPlan(inferPlanFromUser(currentUser));
        await Promise.all([loadConversations(), loadCredits(), loadAccountSummary()]);
      } catch {
        handleUnauthorized();
      } finally {
        setIsAuthLoading(false);
      }
    };

    bootstrapSession();
  }, [handleUnauthorized, loadConversations, loadCredits, loadAccountSummary]);

  useEffect(() => {
    if (user && currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [user, currentConversationId, loadConversation]);

  useEffect(() => {
    if (user && mainView === 'chat') {
      loadConversations();
    }
  }, [user, conversationListTab, mainView, loadConversations]);

  const handleAuthenticated = async (authenticatedUser) => {
    setUser(authenticatedUser);
    setUserPlan(inferPlanFromUser(authenticatedUser));
    clearChatState();
    setMainView(getMainViewFromPath(window.location.pathname));
    await Promise.all([loadConversations(), loadCredits(), loadAccountSummary()]);
  };

  const handleLogout = () => {
    handleUnauthorized();
  };

  const handleNewConversation = async () => {
    setAccountMessage('');
    try {
      const newConv = await api.createConversation();
      if (mainView !== 'chat') {
        window.history.pushState({}, '', '/');
        setMainView('chat');
      }
      const conversationSummary = {
        id: newConv.id,
        created_at: newConv.created_at,
        archived: false,
        message_count: 0,
        title: newConv.title,
      };

      const chatsCache = conversationListCacheRef.current.chats;
      if (Array.isArray(chatsCache)) {
        conversationListCacheRef.current.chats = [conversationSummary, ...chatsCache];
      }

      if (conversationListTab === 'chats') {
        setConversations((prev) => [
          conversationSummary,
          ...prev,
        ]);
        loadConversations({ force: true });
      }
      setCurrentConversationId(newConv.id);
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error('Failed to create conversation:', error);
    }
  };

  const handleAddCredits = async (amount) => {
    setIsAddingCredits(true);
    setAccountMessage('');
    try {
      const response = await api.addCredits(amount);
      setCredits(response.credits ?? 0);
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      setAccountMessage(error.message || 'Failed to add credits.');
    } finally {
      setIsAddingCredits(false);
    }
  };

  const handleSelectConversation = (id) => {
    if (mainView !== 'chat') {
      window.history.pushState({}, '', '/');
      setMainView('chat');
    }
    setCurrentConversationId(id);
  };

  const handleChangeMainView = (view) => {
    const path = getPathFromMainView(view);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setMainView(view);
  };

  const handleChangeConversationTab = (tab) => {
    if (tab === conversationListTab) {
      return;
    }
    latestConversationRequestRef.current += 1;
    const cached = conversationListCacheRef.current[tab];
    if (Array.isArray(cached)) {
      setConversations(cached);
    } else {
      setConversations([]);
    }
    setConversationListTab(tab);
    setCurrentConversationId(null);
    setCurrentConversation(null);
  };

  const handleArchiveConversation = async (conversationId, archived) => {
    try {
      await api.setConversationArchived(conversationId, archived);
      conversationListCacheRef.current = { chats: null, arquived: null };
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
      await loadConversations({ force: true });
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error('Failed to update conversation archive state:', error);
    }
  };

  const isConversationsLoading = pendingConversationLoads > 0;

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      await api.sendMessageStream(currentConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage1 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage2 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage3 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            conversationListCacheRef.current[conversationListTab] = null;
            loadConversations({ force: true });
            break;

          case 'complete':
            setCurrentConversation((prev) => {
              if (!prev) return prev;
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg?.role === 'assistant' && event.metadata) {
                lastMsg.metadata = event.metadata;
              }
              return {
                ...prev,
                messages,
                usage: event.conversation_usage ?? prev.usage,
              };
            });
            loadCredits();
            loadConversation(currentConversationId);
            conversationListCacheRef.current[conversationListTab] = null;
            loadConversations({ force: true });
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      if (error.status === 402) {
        setAccountMessage(error.message || 'Insufficient credits.');
        loadCredits();
      }

      console.error('Failed to send message:', error);
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="auth-loading">
        <p>Checking session...</p>
      </div>
    );
  }

  if (!user) {
    return <AccountAccessPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <ChatPage
      mainView={mainView}
      onChangeMainView={handleChangeMainView}
      conversations={conversations}
      isConversationsLoading={isConversationsLoading}
      conversationListTab={conversationListTab}
      onChangeConversationTab={handleChangeConversationTab}
      onArchiveConversation={handleArchiveConversation}
      currentConversationId={currentConversationId}
      onSelectConversation={handleSelectConversation}
      onNewConversation={handleNewConversation}
      canCreateConversation={true}
      credits={credits}
      onAddCredits={handleAddCredits}
      isAddingCredits={isAddingCredits}
      accountMessage={accountMessage}
      userEmail={user.email}
      userPlan={userPlan}
      onLogout={handleLogout}
      conversation={currentConversation}
      onSendMessage={handleSendMessage}
      isLoading={isLoading}
    />
  );
}

export default App;
