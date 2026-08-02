"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowLeft, CheckCircle2, Play } from 'lucide-react';

function LogoToPlayAnimation({ status }: { status: 'loading' | 'success' | 'error' }) {
  return (
    <div className="relative w-44 h-44 flex items-center justify-center my-2">
      {/* Outer ambient glowing background */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 opacity-40 blur-3xl"
        animate={{
          scale: status === 'loading' ? [0.85, 1.2, 0.85] : 1,
          opacity: status === 'loading' ? [0.3, 0.6, 0.3] : 0.5,
        }}
        transition={{
          duration: 2.5,
          repeat: status === 'loading' ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />

      {/* Main Glass Container */}
      <motion.div
        className="relative w-32 h-32 rounded-3xl bg-slate-900/90 border border-indigo-500/30 p-[2px] shadow-[0_0_50px_rgba(79,70,229,0.35)] flex items-center justify-center overflow-hidden"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Subtle grid pattern background for travel map feel */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #818CF8 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />

        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="loading-animation"
              className="relative w-full h-full flex items-center justify-center"
              exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.3 } }}
            >
              {/* Dynamic SVG Animation: Logo fragments merging into Play Triangle */}
              <svg className="w-16 h-16 relative z-10" viewBox="0 0 100 100" fill="none">
                <defs>
                  <linearGradient id="onJourneyBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="50%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#A855F7" />
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Fragment 1: Top Waypoint Triangle */}
                <motion.path
                  d="M 50 18 L 72 42 L 38 42 Z"
                  fill="url(#onJourneyBrandGrad)"
                  filter="url(#glow)"
                  animate={{
                    x: [24, 0, 0, 24],
                    y: [-18, 0, 0, -18],
                    rotate: [35, 0, 0, 35],
                    opacity: [0.3, 1, 1, 0.3],
                    scale: [0.7, 1, 1, 0.7],
                  }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.4, 0.75, 1],
                  }}
                />

                {/* Fragment 2: Left Vertical Journey Route Ribbon */}
                <motion.path
                  d="M 26 28 L 44 38 L 44 78 L 26 68 Z"
                  fill="url(#onJourneyBrandGrad)"
                  filter="url(#glow)"
                  animate={{
                    x: [-24, 0, 0, -24],
                    y: [12, 0, 0, 12],
                    rotate: [-35, 0, 0, -35],
                    opacity: [0.3, 1, 1, 0.3],
                    scale: [0.7, 1, 1, 0.7],
                  }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.4, 0.75, 1],
                  }}
                />

                {/* Fragment 3: Bottom Right Direction Arrow */}
                <motion.path
                  d="M 44 58 L 76 48 L 44 78 Z"
                  fill="url(#onJourneyBrandGrad)"
                  filter="url(#glow)"
                  animate={{
                    x: [20, 0, 0, 20],
                    y: [22, 0, 0, 22],
                    rotate: [25, 0, 0, 25],
                    opacity: [0.3, 1, 1, 0.3],
                    scale: [0.7, 1, 1, 0.7],
                  }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.4, 0.75, 1],
                  }}
                />

                {/* Central Merged Play Icon path (Appears when fragments converge) */}
                <motion.path
                  d="M 36 24 L 76 50 L 36 76 Z"
                  fill="url(#onJourneyBrandGrad)"
                  filter="url(#glow)"
                  animate={{
                    opacity: [0, 0, 1, 0],
                    scale: [0.8, 0.9, 1.05, 0.8],
                  }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.38, 0.75, 1],
                  }}
                />
              </svg>

              {/* Pulsing Shockwave on Merge */}
              <motion.div
                className="absolute inset-2 rounded-2xl border-2 border-indigo-400/40 pointer-events-none"
                animate={{
                  scale: [0.8, 1.3, 0.8],
                  opacity: [0, 0.6, 0],
                }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: 1.1,
                }}
              />
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success-animation"
              className="relative w-full h-full flex items-center justify-center"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/50">
                <Play className="w-9 h-9 text-white fill-white ml-1 animate-pulse" />
              </div>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error-animation"
              className="relative w-full h-full flex items-center justify-center"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <AlertCircle className="w-9 h-9 text-red-400" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

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
          }, 900);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#090D16] p-4 text-slate-100 relative overflow-hidden select-none">
      {/* Dynamic ambient gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl shadow-indigo-950/50 flex flex-col items-center text-center">
        
        {/* On-Journey Header Branding */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
            <img src="/service_logo2.png" alt="On-Journey Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
            On-Journey
          </span>
        </div>

        {/* Custom Logo-to-Play Animation */}
        <LogoToPlayAnimation status={status} />

        {/* Dynamic Title & Description */}
        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="loading-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-xl font-bold tracking-tight text-white mb-2">
                여정 플레이어를 준비하고 있습니다
              </h2>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                네이버 계정을 안전하게 확인하고<br />
                나만의 여정을 시작할 준비를 하고 있습니다.
              </p>
              
              {/* Progress Indicator */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-950/50 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                <span>네이버 인증 및 데이터 동기화 중</span>
              </div>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-2xl font-black tracking-tight text-white mb-2">
                여정으로 출발합니다!
              </h2>
              <p className="text-indigo-300 text-sm font-medium mb-2">
                네이버 로그인이 성공적으로 완료되었습니다.
              </p>
              <p className="text-slate-500 text-xs">잠시 후 메인 화면으로 이동합니다...</p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col items-center"
            >
              <h2 className="text-xl font-bold tracking-tight text-red-400 mb-2">
                로그인 중 문제가 발생했습니다
              </h2>
              <div className="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 text-left">
                <p className="text-red-300 text-xs leading-relaxed break-all">
                  {errorMessage}
                </p>
              </div>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-medium text-sm transition-all border border-slate-700/70 shadow-lg cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-slate-400" />
                <span>메인 화면으로 돌아가기</span>
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function NaverCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#090D16] text-slate-100">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      }
    >
      <NaverCallbackContent />
    </Suspense>
  );
}
