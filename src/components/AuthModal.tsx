"use client";

import { useRef, useState, type FormEvent } from 'react';
import {
  AUTH_RATE_LIMIT,
  getRateLimitMessage,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '@/lib/auth/security';
import { useAuth } from '@/providers/AuthProvider';

type AuthMode = 'login' | 'signup';

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const failedAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef(0);

  if (!isAuthModalOpen) return null;

  const checkRateLimit = (): boolean => {
    const now = Date.now();
    if (now < lockoutUntilRef.current) {
      setError(getRateLimitMessage(lockoutUntilRef.current - now));
      return false;
    }
    return true;
  };

  const recordFailedAttempt = () => {
    failedAttemptsRef.current += 1;
    if (failedAttemptsRef.current >= AUTH_RATE_LIMIT.maxAttempts) {
      lockoutUntilRef.current = Date.now() + AUTH_RATE_LIMIT.lockoutMs;
      failedAttemptsRef.current = 0;
    }
  };

  const resetRateLimit = () => {
    failedAttemptsRef.current = 0;
    lockoutUntilRef.current = 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!checkRateLimit()) return;

    const passwordError = mode === 'signup' ? validatePassword(password) : null;
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
        resetRateLimit();
      } else {
        const result = await signUp(email, password);
        resetRateLimit();

        if (result === 'email_confirmation_required') {
          setInfo('가입 확인 메일을 발송했습니다. 이메일 인증 후 로그인해주세요.');
          setMode('login');
          setPassword('');
        }
      }

      if (mode === 'login') {
        setEmail('');
        setPassword('');
      }
    } catch (err) {
      recordFailedAttempt();
      setError(err instanceof Error ? err.message : '인증에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setInfo('');
    closeAuthModal();
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
    setError('');
    setInfo('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-100 p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <h2 id="auth-modal-title" className="text-2xl font-black text-zinc-900 mb-1">
          {mode === 'login' ? '로그인' : '회원가입'}
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          여정을 저장하려면 계정이 필요합니다.
        </p>

        <label className="block mb-4">
          <span className="text-sm font-bold text-zinc-700 mb-2 block">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px]"
            autoFocus
          />
        </label>

        <label className="block mb-2">
          <span className="text-sm font-bold text-zinc-700 mb-2 block">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`${MIN_PASSWORD_LENGTH}자 이상, 영문+숫자 포함`}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px]"
          />
        </label>
        <p className="text-xs text-zinc-400 mb-6">
          {MIN_PASSWORD_LENGTH}자 이상, 영문자와 숫자를 포함해주세요.
        </p>

        {info && (
          <p className="text-sm text-blue-600 mb-4" role="status">
            {info}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-500 mb-4" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3 mb-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-bold text-[15px] hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </div>

        <p className="text-center text-sm text-zinc-500">
          {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          {' '}
          <button
            type="button"
            onClick={toggleMode}
            className="font-bold text-blue-600 hover:text-blue-700"
          >
            {mode === 'login' ? '회원가입' : '로그인'}
          </button>
        </p>
      </form>
    </div>
  );
}
