import { useState } from 'react';
import { api } from '../../api';

export default function AccountAccessPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isLogin = mode === 'login';

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');

    try {
      const response = isLogin
        ? await api.login(email, password)
        : await api.register(email, password);

      if (!response.access_token) {
        setNotice('Account created. Confirm your email in Supabase, then log in.');
        return;
      }

      api.setAccessToken(response.access_token);
      onAuthenticated(response.user);
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-sky-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-blue-200 bg-white p-7 shadow-[0_10px_30px_rgba(36,68,121,0.08)]">
        <h1 className="mb-2 text-[28px] text-slate-900">LLM Council</h1>
        <p className="mb-5 text-sm text-slate-600">
          {isLogin ? 'Log in to access your chat' : 'Create an account to start chatting'}
        </p>

        <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
          <label htmlFor="email" className="text-[13px] font-semibold text-slate-800">Email</label>
          <input
            id="email"
            type="email"
            className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password" className="text-[13px] font-semibold text-slate-800">Password</label>
          <input
            id="password"
            type="password"
            className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
          />

          {error && <div className="mt-1 text-[13px] text-rose-700">{error}</div>}
          {notice && <div className="mt-1 text-[13px] text-emerald-700">{notice}</div>}

          <button
            type="submit"
            className="btn mt-1.5 border-sky-500 bg-sky-500 px-3.5 py-2.5 font-semibold text-white hover:border-sky-600 hover:bg-sky-600 disabled:opacity-70"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Please wait...' : isLogin ? 'Log in' : 'Register'}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-2 text-[13px] text-slate-600">
          {isLogin ? 'Need an account?' : 'Already registered?'}
          <button
            type="button"
            className="bg-transparent p-0 font-semibold text-sky-700"
            onClick={() => {
              setMode(isLogin ? 'register' : 'login');
              setError('');
              setNotice('');
            }}
          >
            {isLogin ? 'Register' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
