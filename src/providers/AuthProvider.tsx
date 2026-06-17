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

      setUser(session?.user ?? null);
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
    }),
    [user, loading, isAuthModalOpen, openAuthModal, closeAuthModal, signIn, signUp, signOut],
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
