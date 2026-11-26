import React, { useEffect, useState } from 'react';
import { ShieldCheck, Ticket, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiClientError } from '../lib/api';

type AuthMode = 'login' | 'register' | 'admin-setup';

export function AuthScreen() {
  const {
    loginWithCredentials,
    registerWithCredentials,
    claimFirstAdmin,
    signInWithGoogle,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [adminStatus, setAdminStatus] = useState<{
    hasAdmin: boolean;
    passcodeRequired: boolean;
    canClaimFirstAdmin: boolean;
  } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getAdminStatus()
      .then((status) => {
        if (active) setAdminStatus(status);
      })
      .catch(() => {
        if (active) {
          setAdminStatus({
            hasAdmin: false,
            passcodeRequired: false,
            canClaimFirstAdmin: true,
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    if ((mode === 'register' || mode === 'admin-setup') && name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }

    if ((mode === 'register' || mode === 'admin-setup') && password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (
      mode === 'admin-setup' &&
      adminStatus?.passcodeRequired &&
      !passcode.trim()
    ) {
      setError('Please enter the configured administrator setup passcode.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithCredentials(email.trim(), password);
      } else if (mode === 'register') {
        await registerWithCredentials(name.trim(), email.trim(), password);
      } else {
        await claimFirstAdmin(
          name.trim(),
          email.trim(),
          password,
          passcode.trim() || undefined
        );
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') {
        setError('Google Sign-In window was closed before completing sign-in.');
      } else if (code === 'auth/popup-blocked') {
        setError(
          'Your browser blocked the Google Sign-In popup. Please allow popups or sign in with email and password.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setError(
          'Google Sign-In is not authorized for this preview domain. Use email and password sign-in instead.'
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Google Sign-In could not be completed.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center">
              <Ticket className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              ResolveDesk
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap">
            Support Ticket Management System
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left column: clear operational overview */}
          <div className="lg:col-span-6 space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-[#2563EB] tracking-wide">
                Helpdesk Operations Platform
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight text-balance">
                Structured ticket intake, clear ownership, and full audit trails.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                Submit technical, billing, and security support requests, track live
                status transitions, and resolve issues with role-based access control
                and event-driven notifications.
              </p>
            </div>

            <div className="border-t border-slate-200 pt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Requester Portal
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                    Create tickets, edit open submissions, follow real-time status
                    updates, and reply directly in threaded conversations.
                  </p>
                </div>
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Administrator Queue
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                    Filter across all requesters by status and priority, assign
                    ownership, post internal triage notes, and audit every event.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-2">
                <span>JWT &amp; Google Authentication</span>
                <span aria-hidden="true">·</span>
                <span>Role-Based Access Control</span>
                <span aria-hidden="true">·</span>
                <span>PostgreSQL Persistence</span>
                <span aria-hidden="true">·</span>
                <span>Event-Driven Audit Log</span>
              </div>
            </div>
          </div>

          {/* Right column: crisp single-elevation auth surface */}
          <div className="lg:col-span-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-md mx-auto lg:ml-auto lg:mr-0">
              <div
                role="tablist"
                aria-label="Authentication mode"
                className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-6"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => switchMode('login')}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  onClick={() => switchMode('register')}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'admin-setup'}
                  onClick={() => switchMode('admin-setup')}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'admin-setup'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admin Setup
                </button>
              </div>

              <div className="mb-6">
                <h2 className="font-display text-xl font-semibold text-slate-900">
                  {mode === 'login' && 'Sign in to your account'}
                  {mode === 'register' && 'Create a user account'}
                  {mode === 'admin-setup' && 'Initialize administrator account'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {mode === 'login' &&
                    'Enter your registered email and password to access your helpdesk queue.'}
                  {mode === 'register' &&
                    'Register as a User to submit and track support tickets.'}
                  {mode === 'admin-setup' &&
                    (adminStatus?.hasAdmin && !adminStatus.passcodeRequired
                      ? 'An administrator is already configured. Sign in with your admin account.'
                      : adminStatus?.passcodeRequired
                      ? 'Provide the server administrator passcode to create an Admin account.'
                      : 'First-run bootstrap: claim the initial Administrator account with your chosen password.')}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {(mode === 'register' || mode === 'admin-setup') && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'login' ? 'Enter your password' : 'Minimum 8 characters'
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>

                {mode === 'admin-setup' && adminStatus?.passcodeRequired && (
                  <div>
                    <label
                      htmlFor="auth-passcode"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Administrator Passcode
                    </label>
                    <input
                      id="auth-passcode"
                      name="passcode"
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Configured server passcode"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (mode === 'admin-setup' &&
                      adminStatus !== null &&
                      !adminStatus.canClaimFirstAdmin)
                  }
                  className="w-full h-10 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {mode === 'admin-setup' && (
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>
                    {submitting
                      ? 'Authenticating...'
                      : mode === 'login'
                      ? 'Sign In'
                      : mode === 'register'
                      ? 'Create User Account'
                      : 'Create Administrator Account'}
                  </span>
                  {!submitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">or</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleSubmitting}
                className="w-full h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors flex items-center justify-center gap-2.5 whitespace-nowrap"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>
                  {googleSubmitting ? 'Connecting to Google...' : 'Continue with Google'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
