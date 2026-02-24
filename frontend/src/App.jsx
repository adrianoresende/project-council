import { useState, useEffect, useCallback, useRef } from 'react';
import AccountAccessPage from './pages/account/page';
import ChatPage from './pages/home/page';
import { api } from './api';
import { useI18n } from './i18n';
import {
  clearOAuthCallbackArtifactsFromUrl,
  readOAuthCallbackErrorFromUrl,
  resolveSupabaseSession,
  signOutSupabaseSession,
} from './auth/supabase-auth';

function getMainViewFromPath(pathname) {
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/account') return 'account';
  if (pathname === '/admin') return 'admin';
  return 'chat';
}

function getPathFromMainView(view) {
  if (view === 'pricing') return '/pricing';
  if (view === 'account') return '/account';
  if (view === 'admin') return '/admin';
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

function normalizeRole(value) {
  if (typeof value !== 'string') return 'user';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  return 'user';
}

function inferRoleFromUser(user) {
  if (!user) return 'user';
  return normalizeRole(user?.app_metadata?.role || 'user');
}

function resolveMainViewAccess(view, role) {
  if (view === 'admin' && normalizeRole(role) !== 'admin') {
    return 'chat';
  }
  return view;
}

function emptyUsageSummary() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    total_cost: 0,
    model_calls: 0,
  };
}

function normalizeUploadedFilesForMessage(files) {
  if (!Array.isArray(files)) return [];

  return files
    .filter((file) => file instanceof File)
    .map((file) => ({
      name: file.name,
      kind: file.type.startsWith('image/') ? 'image' : 'file',
      mime_type: file.type || 'application/octet-stream',
      size_bytes: Number(file.size || 0),
    }));
}

function App() {
  const { t } = useI18n();
  const [user, setUser] = useState(null);
  const [userPlan, setUserPlan] = useState('free');
  const [userRole, setUserRole] = useState('user');
  const [authEntryError, setAuthEntryError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [mainView, setMainView] = useState(
    getMainViewFromPath(window.location.pathname)
  );
  const [conversations, setConversations] = useState([]);
  const [pendingConversationLoads, setPendingConversationLoads] = useState(0);
  const [conversationListTab, setConversationListTab] = useState('chats');
  const [credits, setCredits] = useState(0);
  const [accountMessage, setAccountMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canCancelMessage, setCanCancelMessage] = useState(false);
  const latestConversationRequestRef = useRef(0);
  const streamAbortControllerRef = useRef(null);
  const hasReceivedFirstStreamSignalRef = useRef(false);
  const autoConversationBootstrapInFlightRef = useRef(false);
  const currentConversationRef = useRef(null);
  const currentConversationIdRef = useRef(null);
  const conversationListCacheRef = useRef({
    chats: null,
    arquived: null,
  });

  const clearChatState = useCallback(() => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }
    setConversations([]);
    setPendingConversationLoads(0);
    setConversationListTab('chats');
    setCredits(0);
    setAccountMessage('');
    setCurrentConversationId(null);
    setCurrentConversation(null);
    setIsLoading(false);
    setCanCancelMessage(false);
    hasReceivedFirstStreamSignalRef.current = false;
    autoConversationBootstrapInFlightRef.current = false;
    conversationListCacheRef.current = { chats: null, arquived: null };
  }, []);

  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  const handleUnauthorized = useCallback(() => {
    api.clearAccessToken();
    void signOutSupabaseSession().catch(() => {});
    setUser(null);
    setUserPlan('free');
    setUserRole('user');
    setAuthEntryError('');
    clearChatState();
    window.history.replaceState({}, '', '/');
    setMainView('chat');
  }, [clearChatState]);

  useEffect(() => {
    const onPopState = () => {
      const requestedView = getMainViewFromPath(window.location.pathname);
      const allowedView = user
        ? resolveMainViewAccess(requestedView, userRole)
        : requestedView;
      if (allowedView !== requestedView) {
        window.history.replaceState({}, '', getPathFromMainView(allowedView));
      }
      setMainView(allowedView);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user, userRole]);

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
      loadCredits();
    };

    window.addEventListener('account-plan-updated', onPlanUpdated);
    return () => window.removeEventListener('account-plan-updated', onPlanUpdated);
  }, [loadAccountSummary, loadCredits]);

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

  const refreshConversationAfterCancel = useCallback(async (
    conversationId,
    minimumMessageCount
  ) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const maxAttempts = 8;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (currentConversationIdRef.current !== conversationId) {
        return;
      }

      try {
        const conv = await api.getConversation(conversationId);
        const fetchedMessages = Array.isArray(conv?.messages) ? conv.messages : [];
        const fetchedCount = fetchedMessages.length;
        const lastFetchedMessage = fetchedMessages[fetchedMessages.length - 1];
        const hasAssistantTurnPersisted = lastFetchedMessage?.role === 'assistant';
        if (fetchedCount >= minimumMessageCount && hasAssistantTurnPersisted) {
          setCurrentConversation(conv);
          return;
        }
      } catch (error) {
        if (error.status === 401) {
          handleUnauthorized();
          return;
        }
        console.error('Failed to refresh cancelled conversation:', error);
      }

      await wait(attempt < 3 ? 600 : 1000);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const bootstrapSession = async () => {
      let token = api.getAccessToken();
      const callbackError = readOAuthCallbackErrorFromUrl();
      if (callbackError) {
        setAuthEntryError(callbackError);
      }

      if (!token) {
        const { session, error } = await resolveSupabaseSession();
        if (error) {
          setAuthEntryError(error.message || 'Google sign-in failed. Please try again.');
        } else if (session?.access_token) {
          api.setAccessToken(session.access_token);
          token = session.access_token;
          setAuthEntryError('');
        }
      }

      clearOAuthCallbackArtifactsFromUrl();

      if (!token) {
        setIsAuthLoading(false);
        return;
      }

      try {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
        setUserPlan(inferPlanFromUser(currentUser));
        setUserRole(inferRoleFromUser(currentUser));
        setAuthEntryError('');
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
    if (!user) return;
    const allowedView = resolveMainViewAccess(mainView, userRole);
    if (allowedView === mainView) return;
    window.history.replaceState({}, '', getPathFromMainView(allowedView));
    setMainView(allowedView);
  }, [user, userRole, mainView]);

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

  useEffect(() => {
    const ensureChatIsReady = async () => {
      if (!user || mainView !== 'chat') return;
      if (conversationListTab !== 'chats') return;
      if (currentConversationId) return;
      if (pendingConversationLoads > 0) return;
      if (conversationListCacheRef.current.chats === null) return;

      if (credits <= 0) return;
      if (autoConversationBootstrapInFlightRef.current) return;

      autoConversationBootstrapInFlightRef.current = true;
      try {
        const newConv = await api.createConversation();
        setCurrentConversationId(newConv.id);
        setCurrentConversation(newConv);
        loadCredits();
      } catch (error) {
        if (error.status === 401) {
          handleUnauthorized();
          return;
        }
        if (error.status === 402) {
          const dailyLimitMessage =
            userPlan === 'pro'
              ? t('app.dailyTokenLimitReached')
              : t('app.dailyQueryLimitReached');
          setAccountMessage(error.message || dailyLimitMessage);
          loadCredits();
        }
        console.error('Failed to auto-create conversation:', error);
      } finally {
        autoConversationBootstrapInFlightRef.current = false;
      }
    };

    ensureChatIsReady();
  }, [
    user,
    mainView,
    conversationListTab,
    currentConversationId,
    pendingConversationLoads,
    credits,
    userPlan,
    handleUnauthorized,
    loadCredits,
    t,
  ]);

  const handleAuthenticated = async (authenticatedUser) => {
    const normalizedRole = inferRoleFromUser(authenticatedUser);
    const requestedView = getMainViewFromPath(window.location.pathname);
    const allowedView = resolveMainViewAccess(requestedView, normalizedRole);

    setUser(authenticatedUser);
    setUserPlan(inferPlanFromUser(authenticatedUser));
    setUserRole(normalizedRole);
    setAuthEntryError('');
    clearChatState();
    if (allowedView !== requestedView) {
      window.history.replaceState({}, '', getPathFromMainView(allowedView));
    }
    setMainView(allowedView);
    await Promise.all([loadConversations(), loadCredits(), loadAccountSummary()]);
  };

  const handleLogout = () => {
    handleUnauthorized();
  };

  const handleNewConversation = async () => {
    const dailyLimitMessage =
      userPlan === 'pro'
        ? t('app.dailyTokenLimitReached')
        : t('app.dailyQueryLimitReached');

    if (credits <= 0) {
      setAccountMessage(dailyLimitMessage);
      return;
    }
    setAccountMessage('');
    try {
      const newConv = await api.createConversation();
      if (mainView !== 'chat') {
        window.history.pushState({}, '', '/');
        setMainView('chat');
      }
      // Keep new conversations out of the sidebar list until the first message
      // is sent and persisted.
      setCurrentConversationId(newConv.id);
      setCurrentConversation(newConv);
      loadCredits();
    } catch (error) {
      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      if (error.status === 402) {
        setAccountMessage(error.message || dailyLimitMessage);
        loadCredits();
      }
      console.error('Failed to create conversation:', error);
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
    const allowedView = resolveMainViewAccess(view, userRole);
    if (allowedView !== view) {
      return;
    }
    const path = getPathFromMainView(allowedView);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setMainView(allowedView);
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

  const handleSendMessage = async (content, files = []) => {
    if (!currentConversationId) return;
    const activeConversationId = currentConversationId;
    const normalizedFiles = Array.isArray(files) ? files : [];
    const safeFilesForUI = normalizeUploadedFilesForMessage(normalizedFiles);
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;
    hasReceivedFirstStreamSignalRef.current = false;
    setCanCancelMessage(false);

    setIsLoading(true);
    try {
      const userMessage = { role: 'user', content, files: safeFilesForUI };
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

      await api.sendMessageStream(activeConversationId, {
        content,
        files: normalizedFiles,
      }, (eventType, event) => {
        if (!hasReceivedFirstStreamSignalRef.current) {
          hasReceivedFirstStreamSignalRef.current = true;
          setCanCancelMessage(true);
        }

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
            loadConversation(activeConversationId);
            conversationListCacheRef.current[conversationListTab] = null;
            loadConversations({ force: true });
            streamAbortControllerRef.current = null;
            setCanCancelMessage(false);
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            streamAbortControllerRef.current = null;
            setCanCancelMessage(false);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      }, { signal: abortController.signal });
    } catch (error) {
      const isAbortError = error?.name === 'AbortError';
      if (isAbortError) {
        const minimumExpectedMessages = Math.max(
          2,
          Array.isArray(currentConversationRef.current?.messages)
            ? currentConversationRef.current.messages.length
            : 0
        );

        setCurrentConversation((prev) => {
          if (!prev) return prev;
          const messages = [...prev.messages];
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.loading = {
              stage1: false,
              stage2: false,
              stage3: false,
            };
            if (!lastMsg.stage3) {
              lastMsg.stage3 = {
                model: 'system/cancelled',
                response: t('chat.generationStopped'),
                usage: emptyUsageSummary(),
                cancelled: true,
              };
            }
          }
          return { ...prev, messages };
        });
        streamAbortControllerRef.current = null;
        setCanCancelMessage(false);
        setIsLoading(false);

        (async () => {
          await refreshConversationAfterCancel(
            activeConversationId,
            minimumExpectedMessages
          );
          loadCredits();
          conversationListCacheRef.current[conversationListTab] = null;
          loadConversations({ force: true });
        })();
        return;
      }

      if (error.status === 401) {
        handleUnauthorized();
        return;
      }
      if (error.status === 402) {
        const dailyLimitMessage =
          userPlan === 'pro'
            ? t('app.dailyTokenLimitReached')
            : t('app.dailyQueryLimitReached');
        setAccountMessage(
          error.message
          || dailyLimitMessage
        );
        loadCredits();
      }

      console.error('Failed to send message:', error);
      streamAbortControllerRef.current = null;
      setCanCancelMessage(false);
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  const handleCancelMessage = useCallback(() => {
    if (!isLoading) return;
    streamAbortControllerRef.current?.abort();
  }, [isLoading]);

  const canCreateConversation = credits > 0;
  const createConversationDisabledReason =
    userPlan === 'pro'
      ? t('app.dailyTokenLimitReached')
      : t('app.dailyQueryLimitReached');

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <p>{t('app.checkingSession')}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <AccountAccessPage
        onAuthenticated={handleAuthenticated}
        oauthErrorMessage={authEntryError}
      />
    );
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
      canCreateConversation={canCreateConversation}
      createConversationDisabledReason={createConversationDisabledReason}
      credits={credits}
      accountMessage={accountMessage}
      userEmail={user.email}
      userPlan={userPlan}
      userRole={userRole}
      onLogout={handleLogout}
      conversation={currentConversation}
      onSendMessage={handleSendMessage}
      onCancelMessage={handleCancelMessage}
      canCancelMessage={canCancelMessage}
      isLoading={isLoading}
    />
  );
}

export default App;
