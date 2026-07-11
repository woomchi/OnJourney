"use client";

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import JourneySidebar from '@/components/JourneySidebar';
import { useAuth } from '@/providers/AuthProvider';
import LandingPage from '@/components/LandingPage';
import MapHeaderOverlay from '@/components/MapHeaderOverlay';

const MapArea = dynamic(() => import('@/features/map/MapArea'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 animate-spin text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-semibold text-zinc-500 font-sans">지도를 로드하고 있습니다...</span>
      </div>
    </div>
  ),
});

export default function Home() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (loading || !mounted) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm font-semibold text-zinc-500 font-sans">사용자 정보를 확인하는 중...</span>
        </div>
      </div>
    );
  }

  if (!user && isMobile) {
    return <LandingPage />;
  }

  return (
    <div className="flex h-[100dvh] w-full bg-white text-zinc-900 overflow-hidden font-sans relative">
      <JourneySidebar />

      <main className="absolute inset-0 md:relative md:flex-1 md:h-full bg-zinc-50 flex items-center justify-center">
        <MapHeaderOverlay />
        <MapArea />
      </main>
    </div>
  );
}
