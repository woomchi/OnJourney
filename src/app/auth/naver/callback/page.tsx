"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

function NaverCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setErrorMessage('네이버 로그인 요청이 취소되었거나 거절되었습니다.');
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMessage('네이버 인증 코드가 유효하지 않습니다.');
      return;
    }

    const processAuth = async () => {
      try {
        const res = await fetch(
          `/api/auth/naver/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(
            state || '',
          )}&format=json`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );
        const data = await res.json();

        if (res.ok && data.success) {
          setStatus('success');
          setTimeout(() => {
            window.location.href = data.redirectUrl || '/';
          }, 800);
        } else {
          setStatus('error');
          setErrorMessage(data.error || '네이버 로그인 처리 중 오류가 발생했습니다.');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : '네이버 로그인 중 네트워크 오류가 발생했습니다.',
        );
      }
    };

    processAuth();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-slate-100">
      {/* Dynamic ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#03CF5D]/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-[#03CF5D]/5 text-center">
        {/* Naver Branding Icon Container */}
        <div className="flex justify-center mb-6">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-[#03CF5D] text-white shadow-lg shadow-[#03CF5D]/30">
            {status === 'loading' && (
              <span className="text-3xl font-black tracking-tight select-none">N</span>
            )}
            {status === 'success' && (
              <CheckCircle2 className="w-10 h-10 text-white animate-bounce" />
            )}
            {status === 'error' && (
              <AlertCircle className="w-10 h-10 text-white animate-pulse" />
            )}

            {/* Glowing Ring around logo */}
            {status === 'loading' && (
              <span className="absolute -inset-1.5 rounded-2xl border-2 border-[#03CF5D]/40 animate-ping pointer-events-none" />
            )}
          </div>
        </div>

        {/* Dynamic Title & Status */}
        {status === 'loading' && (
          <>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
              네이버 로그인 진행 중
            </h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              네이버 계정 정보를 안전하게 확인하고 있습니다.<br />
              잠시만 기다려 주세요.
            </p>
            <div className="flex items-center justify-center gap-2 text-[#03CF5D] text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>로그인 인증 처리 중...</span>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
              로그인 성공!
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              인증이 완료되었습니다. 메인 화면으로 이동합니다.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-2xl font-bold tracking-tight text-red-400 mb-2">
              로그인에 실패했습니다
            </h2>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-left">
              <p className="text-red-300 text-sm leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>메인 화면으로 돌아가기</span>
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function NaverCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
          <Loader2 className="w-8 h-8 animate-spin text-[#03CF5D]" />
        </div>
      }
    >
      <NaverCallbackContent />
    </Suspense>
  );
}
