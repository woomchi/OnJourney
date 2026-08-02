"use client";

import { useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';

export default function LandingPage() {
  const { signInWithNaver } = useAuth();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNaverSignIn = async () => {
    const clientId = process.env.NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID;
    if (!clientId) {
      alert('[오류] .env.local에 NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID 가 등록되어 있지 않습니다.');
    }

    setError('');
    setIsSubmitting(true);
    try {
      await signInWithNaver();
    } catch (err) {
      setError(err instanceof Error ? err.message : '네이버 로그인에 실패했습니다.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 md:p-8">
        <div className="w-full max-w-sm md:max-w-md flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">

          <div className="flex flex-col items-center text-center mb-8 md:mb-10">
            <img
              src="/service_logo2.png"
              alt="On-Journey Logo"
              className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-xl mb-4 md:mb-6 transform -rotate-3 transition-all duration-300 hover:rotate-0"
            />
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 text-zinc-900">
              On-Journey
            </h1>
            <p className="text-zinc-500 text-sm md:text-base font-medium">
              당신의 모든 이동을 온전히 여정으로
            </p>
          </div>

          <div className="w-full flex flex-col items-center">
            {error && (
              <div className="w-full bg-red-50 text-red-600 text-sm p-3.5 rounded-2xl border border-red-100 mb-4 text-center">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleNaverSignIn}
              disabled={isSubmitting}
              className="w-full py-4 px-5 rounded-2xl bg-[#03C75A] text-white font-bold text-[16px] md:text-[17px] flex items-center justify-center gap-3 hover:bg-[#02b351] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/15"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M16.273 12.845L7.376 0H0v24h7.726v-12.845L16.624 24H24V0h-7.727v12.845z" />
              </svg>
              <span>{isSubmitting ? '네이버 로그인 연결 중...' : '네이버로 3초 만에 시작하기'}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

