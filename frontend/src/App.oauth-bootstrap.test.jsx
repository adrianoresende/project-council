import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { I18nProvider } from './i18n';
import { api } from './api';
import {
  clearOAuthCallbackArtifactsFromUrl,
  readOAuthCallbackErrorFromUrl,
  resolveSupabaseSession,
  signOutSupabaseSession,
} from './auth/supabase-auth';

vi.mock('./pages/account/page', () => ({
  default: ({ oauthErrorMessage = '' }) => (
    <div data-testid="account-page">{oauthErrorMessage}</div>
  ),
}));

vi.mock('./pages/home/page', () => ({
  default: () => <div data-testid="chat-page">Chat page</div>,
}));

vi.mock('./api', () => ({
  api: {
    clearAccessToken: vi.fn(),
    createConversation: vi.fn(),
    getAccessToken: vi.fn(),
    getAccountSummary: vi.fn(),
    getConversation: vi.fn(),
    getCredits: vi.fn(),
    getCurrentUser: vi.fn(),
    listConversations: vi.fn(),
    sendMessageStream: vi.fn(),
    setAccessToken: vi.fn(),
    setConversationArchived: vi.fn(),
  },
}));

vi.mock('./auth/supabase-auth', () => ({
  clearOAuthCallbackArtifactsFromUrl: vi.fn(),
  readOAuthCallbackErrorFromUrl: vi.fn(),
  resolveSupabaseSession: vi.fn(),
  signOutSupabaseSession: vi.fn(),
}));

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}

describe('App OAuth bootstrap regression coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/account?code=pkce-code&state=oauth-state');
    api.getAccessToken.mockReturnValue(null);
    api.getCurrentUser.mockResolvedValue({ email: 'user@example.com' });
    api.listConversations.mockResolvedValue([]);
    api.getCredits.mockResolvedValue({ credits: 0 });
    api.getAccountSummary.mockResolvedValue({ plan: 'free' });
    readOAuthCallbackErrorFromUrl.mockReturnValue('');
    resolveSupabaseSession.mockResolvedValue({ session: null, error: null });
    signOutSupabaseSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('resolves callback session before clearing callback artifacts on bootstrap', async () => {
    const bootstrapOrder = [];
    resolveSupabaseSession.mockImplementation(async () => {
      bootstrapOrder.push('resolve-session');
      return { session: null, error: null };
    });
    clearOAuthCallbackArtifactsFromUrl.mockImplementation(() => {
      bootstrapOrder.push('clear-artifacts');
    });

    renderApp();

    await waitFor(() => {
      expect(resolveSupabaseSession).toHaveBeenCalledTimes(1);
      expect(clearOAuthCallbackArtifactsFromUrl).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('account-page')).toBeTruthy();
    });

    expect(bootstrapOrder).toEqual(['resolve-session', 'clear-artifacts']);
    expect(api.setAccessToken).not.toHaveBeenCalled();
    expect(api.getCurrentUser).not.toHaveBeenCalled();
  });
});
