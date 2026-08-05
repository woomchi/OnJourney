"use client";

import { useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signInWithNaver } = useAuth();
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

  const handleClose = () => {
    setError('');
    closeAuthModal();
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="p-8 max-w-sm rounded-3xl sm:rounded-3xl">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-2xl font-bold text-zinc-900 mb-1">
            로그인 / 회원가입
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            나만의 여행 여정을 안전하게 저장하고 관리해보세요.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 flex flex-col items-center">
          {error && (
            <p className="w-full text-sm text-red-500 mb-4 text-center bg-red-50 p-3 rounded-xl border border-red-100" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleNaverSignIn}
            disabled={isSubmitting}
            className="w-full py-4 px-5 rounded-2xl bg-[#03C75A] text-white font-bold text-[16px] flex items-center justify-center gap-3 hover:bg-[#02b351] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-500/10"
          >
            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M16.273 12.845L7.376 0H0v24h7.726v-12.845L16.624 24H24V0h-7.727v12.845z" />
            </svg>
            <span>{isSubmitting ? '네이버 로그인 연결 중...' : '네이버로 3초 만에 시작하기'}</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="mt-6 text-xs font-semibold text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
