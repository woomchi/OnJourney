"use client";

import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import PlaceSearchBar from './PlaceSearchBar';

export default function MapHeaderOverlay() {
  const { user, signOut } = useAuth();
  const isDrawerMaximized = useJourneyStore((state) => state.isDrawerMaximized);

  const handleProfileClick = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      signOut();
    }
  };

  return (
    <div 
      className={`absolute top-4 left-4 right-4 z-[100] flex items-start gap-2 pointer-events-none transition-all duration-300 ${
        isDrawerMaximized ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="flex-1 pointer-events-auto">
        <PlaceSearchBar />
      </div>
      
      <button
        onClick={handleProfileClick}
        title={user?.email || '프로필'}
        className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] pointer-events-auto hover:bg-zinc-50 transition-colors flex-shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-zinc-600">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      </button>
    </div>
  );
}
