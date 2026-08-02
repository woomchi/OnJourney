"use client";

import { useRef, useState, type FormEvent } from 'react';
import {
  AUTH_RATE_LIMIT,
  getRateLimitMessage,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '@/lib/auth/security';
import { useAuth } from '@/providers/AuthProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type AuthMode = 'login' | 'signup' | 'reset_request';

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signIn, signUp, resetPasswordForEmail, signInWithNaver } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const failedAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef(0);

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

  const handleNaverSignIn = async () => {
    const clientId = process.env.NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (!clientId) {
      alert('[오류] .env.local에 NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID 가 등록되어 있지 않습니다.');
    }

    setError('');
    setInfo('');
    setIsSubmitting(true);
    try {
      await signInWithNaver();
    } catch (err) {
      setError(err instanceof Error ? err.message : '네이버 로그인에 실패했습니다.');
      setIsSubmitting(false);
    }
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
        setEmail('');
        setPassword('');
      } else if (mode === 'signup') {
        const result = await signUp(email, password);
        resetRateLimit();

        if (result === 'email_confirmation_required') {
          setInfo('가입 확인 메일을 발송했습니다. 이메일 인증 후 로그인해주세요.');
          setMode('login');
          setPassword('');
        }
      } else if (mode === 'reset_request') {
        await resetPasswordForEmail(email);
        resetRateLimit();
        setInfo('입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다. 메일함을 확인해주세요.');
      }
    } catch (err) {
      recordFailedAttempt();
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setInfo('');
    setMode('login');
    closeAuthModal();
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setInfo('');
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="p-8">
        <DialogHeader>
          <DialogTitle>
            {mode === 'login' ? '로그인' : mode === 'signup' ? '회원가입' : '비밀번호 재설정'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'reset_request'
              ? '가입하신 이메일 주소를 입력해주시면 재설정 링크를 보내드립니다.'
              : '여정을 저장하려면 계정이 필요합니다.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4">
          <label className="block mb-4">
            <span className="text-sm font-bold text-zinc-700 mb-2 block">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] text-zinc-900"
              autoFocus
            />
          </label>

          {mode !== 'reset_request' && (
            <>
              <div className="mb-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-zinc-700">비밀번호</span>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('reset_request')}
                      className="text-xs font-semibold text-zinc-500 hover:text-blue-600 cursor-pointer"
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`${MIN_PASSWORD_LENGTH}자 이상, 영문+숫자 포함`}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] text-zinc-900"
                />
              </div>
              <p className="text-xs text-zinc-400 mb-6">
                {MIN_PASSWORD_LENGTH}자 이상, 영문자와 숫자를 포함해주세요.
              </p>
            </>
          )}

          {info && (
            <p className="text-sm text-blue-600 mb-4 bg-blue-50 p-3 rounded-xl border border-blue-100" role="status">
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
              className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-bold text-[15px] hover:bg-zinc-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting
                ? '처리 중...'
                : mode === 'login'
                  ? '로그인'
                  : mode === 'signup'
                    ? '가입하기'
                    : '재설정 링크 발송'}
            </button>
          </div>
        </form>

        {mode !== 'reset_request' && (
          <div className="mb-6">
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-zinc-400 font-semibold">또는 네이버로 로그인</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNaverSignIn}
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#03C75A] text-white font-bold text-[15px] flex items-center justify-center gap-2.5 hover:bg-[#02b351] transition-all disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M16.273 12.845L7.376 0H0v24h7.726v-12.845L16.624 24H24V0h-7.727v12.845z" />
              </svg>
              <span>네이버로 시작하기</span>
            </button>
          </div>
        )}

        <div className="text-center text-sm text-zinc-500">
          {mode === 'login' && (
            <p>
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                회원가입
              </button>
            </p>
          )}
          {mode === 'signup' && (
            <p>
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                로그인
              </button>
            </p>
          )}
          {mode === 'reset_request' && (
            <p>
              생각나셨나요?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                로그인으로 돌아가기
              </button>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
