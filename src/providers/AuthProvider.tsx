"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import {
  getAuthErrorMessage,
  normalizeEmail,
  validatePassword,
} from '@/lib/auth/security';
import { createClient } from '@/lib/supabase/client';

export type SignUpResult = 'session_created' | 'email_confirmation_required';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signInWithNaver: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const getUserPromise = supabase.auth.getUser();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timeout')), 5000)
        );

        const { data: { user: currentUser } } = await Promise.race([
          getUserPromise,
          timeoutPromise,
        ]);

        if (active) {
          setUser(currentUser);
        }
      } catch (err) {
        console.error('Failed to get user session (timeout or error):', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser((prevUser) => {
        const nextUser = session?.user ?? null;
        if (
          prevUser?.id === nextUser?.id &&
          prevUser?.updated_at === nextUser?.updated_at
        ) {
          return prevUser;
        }
        return nextUser;
      });
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = normalizeEmail(email);

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        throw new Error(getAuthErrorMessage('login', error));
      }

      closeAuthModal();
    },
    [supabase, closeAuthModal],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      const normalizedEmail = normalizeEmail(email);
      const passwordError = validatePassword(password);
      if (passwordError) {
        throw new Error(passwordError);
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (error) {
        throw new Error(getAuthErrorMessage('signup', error));
      }

      if (!data.session) {
        return 'email_confirmation_required';
      }

      closeAuthModal();
      return 'session_created';
    },
    [supabase, closeAuthModal],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error('로그아웃에 실패했습니다. 다시 시도해주세요.');
    }
  }, [supabase]);

  const resetPasswordForEmail = useCallback(
    async (email: string) => {
      const normalizedEmail = normalizeEmail(email);
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) {
        throw new Error(getAuthErrorMessage('reset_request', error));
      }
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      const passwordError = validatePassword(password);
      if (passwordError) {
        throw new Error(passwordError);
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw new Error(getAuthErrorMessage('reset_password', error));
      }
    },
    [supabase],
  );

  const signInWithNaver = useCallback(async () => {
    const clientId = process.env.NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID;
    if (!clientId) {
      const errorMsg = '네이버 로그인 Client ID(NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID)가 설정되지 않았습니다.';
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const redirectUri = `${window.location.origin}/api/auth/naver/callback`;
    const state = Math.random().toString(36).substring(2, 15);
    const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    window.location.href = naverAuthUrl;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      signIn,
      signUp,
      signOut,
      resetPasswordForEmail,
      updatePassword,
      signInWithNaver,
    }),
    [
      user,
      loading,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      signIn,
      signUp,
      signOut,
      resetPasswordForEmail,
      updatePassword,
      signInWithNaver,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
