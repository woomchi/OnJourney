"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import JourneySidebar from '@/components/JourneySidebar';
import MapHeaderOverlay from '@/components/MapHeaderOverlay';

const MapArea = dynamic(() => import('@/features/map/MapArea'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-zinc-100" />,
});

function LogoGearToPlayAnimation({ status }: { status: 'loading' | 'success' | 'error' }) {
  return (
    <div className="relative w-48 h-48 flex items-center justify-center my-2 select-none">
      {/* Outer ambient glowing aura */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-400 via-indigo-400 to-purple-400 opacity-35 blur-3xl"
        animate={{
          scale: status === 'loading' ? [0.85, 1.25, 0.85] : 1.1,
          opacity: status === 'loading' ? [0.25, 0.5, 0.25] : 0.35,
        }}
        transition={{
          duration: 2.2,
          repeat: status === 'loading' ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />

      {/* Main Container: On-Journey Brand Gradient */}
      <motion.div
        className="relative w-36 h-36 rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-2 shadow-[0_12px_40px_rgba(79,70,229,0.35)] flex items-center justify-center overflow-hidden"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />

        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="overwatch-loading"
              className="relative w-full h-full flex items-center justify-center"
              exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.3 } }}
            >
              {/* Overwatch Style Outer Spinner Ring */}
              <svg
                className="absolute inset-0 w-full h-full z-0 p-1 overflow-visible"
                viewBox="0 0 100 100"
                fill="none"
              >
                {/* Outer Primary Arc Ring */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="43"
                  stroke="#FFFFFF"
                  strokeWidth="3.2"
                  strokeOpacity="0.9"
                  strokeDasharray="42 58"
                  strokeLinecap="round"
                  style={{ transformOrigin: '50px 50px' }}
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.2, 1], // Overwatch signature smooth ease
                  }}
                />

                {/* Outer Secondary Arc Ring */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="43"
                  stroke="#FFFFFF"
                  strokeWidth="1.8"
                  strokeOpacity="0.45"
                  strokeDasharray="18 32 24 26"
                  strokeLinecap="round"
                  style={{ transformOrigin: '50px 50px' }}
                  animate={{ rotate: -360 }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              </svg>

              {/* Official Authentic On-Journey Logo PNG (No manual path cutoff error!) */}
              <div className="relative z-10 w-16 h-16 flex items-center justify-center drop-shadow-md">
                <img
                  src="/service_logo2.png"
                  alt="On-Journey Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="overwatch-success"
              className="relative w-full h-full flex items-center justify-center"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <svg className="w-28 h-28 relative z-10 overflow-visible" viewBox="0 0 100 100" fill="none">
                <defs>
                  <filter id="successWhiteGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* TRANSFORMED SOLID PLAY PLAYER TRIANGLE ICON (▶) UPON SUCCESS */}
                <g transform="translate(50 50) scale(0.65) translate(-50 -50)">
                  <motion.path
                    d="M 28 20 L 76 50 L 28 80 Z"
                    fill="#FFFFFF"
                    filter="url(#successWhiteGlow)"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </g>

                {/* Outer Success Ring Aura */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="43"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                  initial={{ scale: 0.8, opacity: 1 }}
                  animate={{ scale: 1.15, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </svg>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="overwatch-error"
              className="relative w-full h-full flex items-center justify-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-white/20 border border-white/40 flex items-center justify-center shadow-lg">
                <AlertCircle className="w-9 h-9 text-white" />
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
          setTimeout(() => {
            setStatus('success');
            setTimeout(() => {
              window.location.href = data.redirectUrl || '/';
            }, 1000);
          }, 600);
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
    <div className="relative min-h-screen w-full overflow-hidden select-none bg-zinc-50">
      {/* Background: Blurred Initial App Screen (Map + Sidebar + Header) */}
      <div className="fixed inset-0 pointer-events-none filter blur-md brightness-[0.92] scale-[1.03] z-0">
        <div className="flex h-[100dvh] w-full bg-white text-zinc-900 overflow-hidden font-sans relative">
          <JourneySidebar />
          <main className="absolute inset-0 md:relative md:flex-1 md:h-full bg-zinc-50 flex items-center justify-center z-10 overflow-hidden">
            <MapHeaderOverlay />
            <MapArea />
          </main>
        </div>
      </div>

      {/* Dim Overlay */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-10 pointer-events-none" />

      {/* Centered Floating Modal Area */}
      <div className="fixed inset-0 z-20 flex flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl border border-white/80 rounded-3xl p-8 shadow-2xl shadow-zinc-900/20 flex flex-col items-center text-center">
          
          {/* On-Journey Header Branding */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
              <img src="/service_logo2.png" alt="On-Journey Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-700">
              On-Journey
            </span>
          </div>

          {/* Authentic Logo Image during loading -> Solid Play Icon on Success */}
          <LogoGearToPlayAnimation status={status} />

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
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-2">
                  네이버 로그인 진행 중
                </h2>
                <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
                  네이버 계정을 안전하게 인증하고<br />
                  여정 데이터 세션을 수립하고 있습니다.
                </p>
                
                {/* Progress Indicator */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  <span>로그인 세션 인증 진행 중...</span>
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
                <h2 className="text-2xl font-black tracking-tight text-zinc-900 mb-2">
                  여정 재생 준비 완료!
                </h2>
                <p className="text-blue-600 text-sm font-medium mb-2">
                  네이버 인증 완료! 여정 플레이어로 이동합니다.
                </p>
                <p className="text-zinc-400 text-xs">잠시 후 메인 화면으로 이동합니다...</p>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                key="error-text"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col items-center"
              >
                <h2 className="text-xl font-bold tracking-tight text-red-600 mb-2">
                  로그인 중 문제가 발생했습니다
                </h2>
                <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-4 mb-6 text-left">
                  <p className="text-red-600 text-xs leading-relaxed break-all">
                    {errorMessage}
                  </p>
                </div>
                <a
                  href="/"
                  className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm transition-all shadow-lg cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-white" />
                  <span>메인 화면으로 돌아가기</span>
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function NaverCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFFFFF] text-zinc-900">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      }
    >
      <NaverCallbackContent />
    </Suspense>
  );
}
