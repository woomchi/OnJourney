"use client";

import { useState } from 'react';
import { useClickAway } from '@uidotdev/usehooks';
import { useAuth } from '@/providers/AuthProvider';
import { useDialog } from '@/providers/DialogProvider';
import PlaceSearchBar from '@/features/places/PlaceSearchBar';
import MapCategoryChips from '@/components/map/MapCategoryChips';
import { User, Settings, LogOut, ArrowLeft } from 'lucide-react';

import { useJourneyStore } from '@/stores/journey-store';

export default function MapHeaderOverlay() {
  const { user, signOut } = useAuth();
  const { alert } = useDialog();
  const { isSearchMode, closeSearchMode } = useJourneyStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuRef = useClickAway<HTMLDivElement>(() => {
    setIsMenuOpen(false);
  });

  const handleProfileClick = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  if (isSearchMode) {
    return (
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 pointer-events-none md:right-auto md:max-w-xl">
        <button
          type="button"
          onClick={closeSearchMode}
          className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/95 backdrop-blur-xl border border-zinc-200 shadow-[0_4px_20px_rgba(0,0,0,0.1)] text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 transition-all pointer-events-auto flex-shrink-0 cursor-pointer active:scale-95 md:hidden"
          title="검색 종료"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0 overflow-hidden pointer-events-auto">
          <MapCategoryChips />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-4 right-4 z-10 flex items-start gap-2 pointer-events-none md:hidden">
      <div className="flex-1 pointer-events-auto">
        <PlaceSearchBar />
      </div>

      <div className="relative pointer-events-auto" ref={menuRef}>
        <button
          onClick={handleProfileClick}
          title={user?.email || '프로필'}
          className="w-11 h-11 flex items-center justify-center rounded-2xl bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:bg-zinc-50 transition-colors flex-shrink-0"
        >
          <User className="w-6 h-6 text-zinc-600" strokeWidth={1.5} />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-3 border-b border-zinc-100">
              <p className="text-sm font-medium text-zinc-800 truncate">{user?.email || '사용자'}</p>
            </div>
            <button
              className="w-full text-left px-4 py-3 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-2"
              onClick={async () => {
                setIsMenuOpen(false);
                await alert('설정 기능은 준비 중입니다.');
              }}
            >
              <Settings className="w-4 h-4" strokeWidth={1.5} />
              설정
            </button>
            <button
              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              onClick={() => {
                setIsMenuOpen(false);
                signOut();
              }}
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              로그아웃
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
