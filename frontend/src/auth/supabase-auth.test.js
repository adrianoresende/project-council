import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}));

async function importAuthModule() {
  vi.resetModules();
  return import('./supabase-auth');
}

function setCurrentUrl(path) {
  window.history.replaceState({}, '', path);
}

describe('supabase-auth OAuth regression coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    supabaseMocks.createClient.mockReturnValue({
      auth: {
        signInWithOAuth: supabaseMocks.signInWithOAuth,
        exchangeCodeForSession: supabaseMocks.exchangeCodeForSession,
        getSession: supabaseMocks.getSession,
        signOut: supabaseMocks.signOut,
      },
    });
    setCurrentUrl('/account');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    setCurrentUrl('/');
  });

  it('uses current origin and path as Google OAuth redirect target', async () => {
    setCurrentUrl('/account?foo=1#ignored');
    supabaseMocks.signInWithOAuth.mockResolvedValue({ error: null });
    const { startGoogleOAuthSignIn } = await importAuthModule();

    await startGoogleOAuthSignIn();

    expect(supabaseMocks.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/account`,
      },
    });
  });

  it('checks current session before exchanging callback code in PKCE callback path', async () => {
    setCurrentUrl('/account?code=pkce-code&state=oauth-state');
    const callOrder = [];
    supabaseMocks.getSession.mockImplementation(async () => {
      callOrder.push('get-session');
      return { data: { session: null }, error: null };
    });
    supabaseMocks.exchangeCodeForSession.mockImplementation(async () => {
      callOrder.push('exchange-code');
      return {
        data: { session: { access_token: 'oauth-token' } },
        error: null,
      };
    });
    const { resolveSupabaseSession } = await importAuthModule();

    const result = await resolveSupabaseSession();

    expect(supabaseMocks.getSession).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(callOrder).toEqual(['get-session', 'exchange-code']);
    expect(result).toEqual({
      session: { access_token: 'oauth-token' },
      error: null,
    });
  });

  it('falls back to getSession when callback URL has no auth code', async () => {
    setCurrentUrl('/account?next=chat');
    supabaseMocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'stored-token' } },
      error: null,
    });
    const { resolveSupabaseSession } = await importAuthModule();

    const result = await resolveSupabaseSession();

    expect(supabaseMocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(supabaseMocks.getSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      session: { access_token: 'stored-token' },
      error: null,
    });
  });

  it('clears OAuth callback artifacts while preserving unrelated URL params', async () => {
    setCurrentUrl('/account?code=pkce-code&state=abc&next=chat#access_token=abc');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const { clearOAuthCallbackArtifactsFromUrl } = await importAuthModule();

    clearOAuthCallbackArtifactsFromUrl();

    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/account?next=chat');
  });
});
