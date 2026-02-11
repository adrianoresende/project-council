import { useState } from 'react';
import { api } from '../api';
import './AuthScreen.css';

export default function AuthScreen({ onAuthenticated }) {
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
    <div className="auth-screen">
      <div className="auth-card">
        <h1>LLM Council</h1>
        <p>{isLogin ? 'Log in to access your chat' : 'Create an account to start chatting'}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
          />

          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : isLogin ? 'Log in' : 'Register'}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? 'Need an account?' : 'Already registered?'}
          <button
            type="button"
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
