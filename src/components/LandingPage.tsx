"use client";

import { useState, useRef, type FormEvent } from 'react';
import {
  AUTH_RATE_LIMIT,
  getRateLimitMessage,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '@/lib/auth/security';
import { useAuth } from '@/providers/AuthProvider';

type AuthMode = 'login' | 'signup';

export default function LandingPage() {
  const { signIn, signUp } = useAuth();
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

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
    setError('');
    setInfo('');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white p-6 md:p-12 overflow-y-auto">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg flex flex-col animate-in fade-in zoom-in-95 duration-500">
        
        <div className="flex flex-col items-center text-center mb-10 md:mb-14">
          <img 
            src="/service_logo2.png" 
            alt="On-Journey Logo" 
            className="w-20 h-20 md:w-28 md:h-28 lg:w-32 lg:h-32 object-contain drop-shadow-xl mb-6 md:mb-8 transform -rotate-3 transition-all duration-300" 
          />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight mb-2 md:mb-3 text-zinc-900 transition-all duration-300">On-Journey</h1>
          <p className="text-zinc-500 text-sm md:text-base lg:text-lg font-medium transition-all duration-300">당신의 모든 이동을 온전히 여정으로</p>
        </div>
        
        <div className="w-full">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-5 lg:gap-6">
            <div>
              <label className="text-sm md:text-base font-bold text-zinc-700 mb-2 md:mb-3 block">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full px-4 md:px-5 py-3.5 md:py-4 rounded-xl md:rounded-2xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] md:text-[17px] text-zinc-900 bg-zinc-50 focus:bg-white placeholder:text-zinc-400"
              />
            </div>

            <div>
              <label className="text-sm md:text-base font-bold text-zinc-700 mb-2 md:mb-3 block">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`${MIN_PASSWORD_LENGTH}자 이상, 영문+숫자 포함`}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 md:px-5 py-3.5 md:py-4 rounded-xl md:rounded-2xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] md:text-[17px] text-zinc-900 bg-zinc-50 focus:bg-white placeholder:text-zinc-400"
              />
              {mode === 'signup' && (
                <p className="text-xs md:text-sm text-zinc-400 mt-2 ml-1">
                  {MIN_PASSWORD_LENGTH}자 이상, 영문자와 숫자를 포함해주세요.
                </p>
              )}
            </div>

            {info && (
              <div className="bg-blue-50 text-blue-600 text-sm md:text-base px-4 py-3 md:py-4 rounded-xl md:rounded-2xl border border-blue-100">
                {info}
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-600 text-sm md:text-base px-4 py-3 md:py-4 rounded-xl md:rounded-2xl border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 md:py-5 mt-6 md:mt-8 rounded-xl md:rounded-2xl bg-blue-600 text-white font-bold text-[15px] md:text-[17px] hover:bg-blue-700 transition-all disabled:opacity-50 shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)] cursor-pointer"
            >
              {isSubmitting ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </form>

          <div className="mt-10 md:mt-12 text-center">
            <p className="text-sm md:text-base text-zinc-500">
              {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
              <button
                type="button"
                onClick={toggleMode}
                className="ml-2 font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
              >
                {mode === 'login' ? '회원가입' : '로그인'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
