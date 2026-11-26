import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { firebaseAuth, googleAuthProvider } from '../lib/firebase';
import { api } from '../lib/api';
import type { AuthUser } from '../shared/types';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  initializing: boolean;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerWithCredentials: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  claimFirstAdmin: (
    name: string,
    email: string,
    password: string,
    passcode?: string
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Tokens stay strictly in React memory — never persisted to localStorage or sessionStorage
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    const fallbackTimer = window.setTimeout(() => {
      if (active) setInitializing(false);
    }, 1500);

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (fbUser) => {
        window.clearTimeout(fallbackTimer);
        if (fbUser) {
          try {
            const idToken = await fbUser.getIdToken();
            const res = await api.me(idToken);
            if (active) {
              setToken(idToken);
              setUser(res.user);
            }
          } catch (err) {
            console.error('Failed to synchronize Google sign-in session:', err);
          }
        }
        if (active) setInitializing(false);
      },
      () => {
        window.clearTimeout(fallbackTimer);
        if (active) setInitializing(false);
      }
    );

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const loginWithCredentials = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      setToken(res.token);
      setUser(res.user);
    },
    []
  );

  const registerWithCredentials = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.register({ name, email, password });
      setToken(res.token);
      setUser(res.user);
    },
    []
  );

  const claimFirstAdmin = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      passcode?: string
    ) => {
      const res = await api.claimAdmin({ name, email, password, passcode });
      setToken(res.token);
      setUser(res.user);
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(firebaseAuth, googleAuthProvider);
    const idToken = await result.user.getIdToken();
    const res = await api.me(idToken);
    setToken(idToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    if (firebaseAuth.currentUser) {
      await firebaseSignOut(firebaseAuth).catch(() => undefined);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        initializing,
        loginWithCredentials,
        registerWithCredentials,
        claimFirstAdmin,
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
