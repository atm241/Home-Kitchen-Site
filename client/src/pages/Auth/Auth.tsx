import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogoMark } from '../../components/Brand/Logo';
import { BRAND_NAME, BRAND_TAGLINE } from '../../components/Brand/brand';
import styles from './Auth.module.css';

const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joiningHousehold, setJoiningHousehold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup({
          email,
          password,
          name,
          inviteCode: joiningHousehold ? inviteCode.trim() : undefined,
        });
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoImg}><LogoMark size={56} /></span>
          <h1 className={styles.title}>{BRAND_NAME}</h1>
          <p className={styles.subtitle}>{BRAND_TAGLINE}</p>
        </div>

        <div className={styles.toggleRow}>
          <button
            type="button"
            className={`${styles.toggleButton} ${mode === 'login' ? styles.toggleButtonActive : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`${styles.toggleButton} ${mode === 'signup' ? styles.toggleButtonActive : ''}`}
            onClick={() => { setMode('signup'); setError(null); }}
          >
            Sign Up
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className={styles.formGroup}>
              <label htmlFor="name">Your Name</label>
              <input
                id="name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'signup' && <span className={styles.hint}>At least 8 characters</span>}
          </div>

          {mode === 'signup' && (
            <div className={styles.formGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={joiningHousehold}
                  onChange={(e) => setJoiningHousehold(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Joining an existing household?
              </label>
              {joiningHousehold && (
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Household invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  style={{ marginTop: 8 }}
                />
              )}
            </div>
          )}

          <button type="submit" className={styles.submitButton} disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className={styles.switchMode}>
          {mode === 'login' ? (
            <>Don't have an account? <button onClick={() => setMode('signup')}>Sign up</button></>
          ) : (
            <>Already have an account? <button onClick={() => setMode('login')}>Log in</button></>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
