"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { fetchLatestJourney } from '@/lib/journeys';
import CreateJourneyModal from '@/components/CreateJourneyModal';
import AuthModal from '@/components/AuthModal';
import PlaceList from '@/components/PlaceList';

function formatJourneyDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export default function JourneySidebar() {
  const { user, loading: authLoading, openAuthModal, signOut } = useAuth();
  const { activeJourney, openCreateForm, setActiveJourney, clearJourney } =
    useJourneyStore();
  const [pendingCreate, setPendingCreate] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (!user) {
      clearJourney();
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      setIsHydrating(true);
      const latest = await fetchLatestJourney();
      if (!cancelled && latest) {
        setActiveJourney(latest);
      }
      if (!cancelled) {
        setIsHydrating(false);
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [user, setActiveJourney, clearJourney]);

  useEffect(() => {
    if (user && pendingCreate) {
      setPendingCreate(false);
      openCreateForm();
    }
  }, [user, pendingCreate, openCreateForm]);

  const handleCreateClick = () => {
    if (!user) {
      setPendingCreate(true);
      openAuthModal();
      return;
    }
    openCreateForm();
  };

  const handleSignOut = async () => {
    await signOut();
    clearJourney();
  };

  const isLoading = authLoading || isHydrating;

  // ── 여정이 있는 상태 ──────────────────────────────────
  if (!isLoading && activeJourney) {
    return (
      <>
        <aside className="w-[30%] min-w-[320px] max-w-[400px] h-full flex flex-col bg-white border-r border-zinc-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">

          {/* ── 헤더: 뒤로가기 | 제목 (center) | 편집 ── */}
          <header className="flex items-center border-b border-zinc-100/80 bg-white/60 backdrop-blur-md flex-shrink-0 h-14">
            {/* 뒤로가기 */}
            <button
              type="button"
              onClick={() => clearJourney()}
              className="flex items-center gap-1 px-4 h-full text-zinc-400 hover:text-zinc-700 transition-colors text-xs font-semibold flex-shrink-0 w-20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              뒤로
            </button>

            {/* 여정 제목 (가운데) */}
            <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-1">
              <h2 className="text-sm font-bold text-zinc-900 truncate max-w-full leading-tight">
                {activeJourney.title}
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {formatJourneyDate(activeJourney.journey_date)}&nbsp;·&nbsp;
                {activeJourney.transport_type === 'public' ? '대중교통' : '차량'}
              </p>
            </div>

            {/* 편집 */}
            <button
              type="button"
              onClick={() => setIsEditMode((v) => !v)}
              className={`
                flex items-center gap-1 px-4 h-full text-xs font-semibold flex-shrink-0 w-20 justify-end transition-colors
                ${isEditMode ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-700'}
              `}
            >
              {isEditMode ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  완료
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  편집
                </>
              )}
            </button>
          </header>

          {/* ── 장소 목록 (스크롤 영역) ── */}
          <PlaceList editMode={isEditMode} />

          {/* ── 하단 고정: 장소 추가 버튼 ── */}
          <div className="flex-shrink-0 px-5 py-4 border-t border-zinc-100 bg-white/80 backdrop-blur-md">
            <button
              type="button"
              onClick={handleCreateClick}
              className="relative group w-full py-3.5 bg-zinc-900 rounded-2xl text-white font-bold text-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 relative z-10 transition-transform group-hover:rotate-90 duration-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="relative z-10 tracking-wide">장소 추가</span>
            </button>
          </div>
        </aside>

        <CreateJourneyModal />
        <AuthModal />
      </>
    );
  }

  // ── 로딩 or 여정 없음 상태 ────────────────────────────
  return (
    <>
      <aside className="w-[30%] min-w-[320px] max-w-[400px] h-full flex flex-col bg-white border-r border-zinc-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">

        {/* 앱 로고 헤더 */}
        <header className="px-8 py-7 border-b border-zinc-100/80 bg-white/50 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                  <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600">
                On-Journey
              </h1>
            </div>
            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                로그아웃
              </button>
            )}
          </div>
        </header>

        {/* 본문 */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-6 h-6 animate-spin text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm text-zinc-400 font-medium">불러오는 중...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-transparent to-zinc-50/50">
            <div className="w-24 h-24 mb-6 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            </div>
            <p className="text-xl font-bold text-zinc-800 mb-2">새로운 여정을 시작해볼까요?</p>
            <p className="text-sm text-zinc-500 font-medium leading-relaxed max-w-[240px]">
              {user
                ? '아직 계획된 여정이 없습니다. 지금 바로 당신만의 특별한 경로를 만들어보세요.'
                : '로그인 후 여정을 만들고 저장할 수 있습니다.'}
            </p>
          </div>
        )}

        {/* 여정 생성 버튼 */}
        {!isLoading && (
          <div className="p-6 bg-white/80 backdrop-blur-md border-t border-zinc-100 flex-shrink-0">
            <button
              type="button"
              onClick={handleCreateClick}
              className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 relative z-10 transition-transform group-hover:rotate-90 duration-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="relative z-10 tracking-wide">여정 생성하기</span>
            </button>
          </div>
        )}
      </aside>

      <CreateJourneyModal />
      <AuthModal />
    </>
  );
}
