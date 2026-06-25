"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { formatJourneyDate } from '@/lib/journeyUtils';
import { getCategoryTheme } from '@/lib/categoryUtils';
import PlaceList from '@/components/PlaceList';
import EditJourneyModal from '@/components/EditJourneyModal';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey, Place, PlaceResult } from '@/types/journey';

interface ActiveJourneySidebarProps {
  activeJourney: Journey;
}

export default function ActiveJourneySidebar({ activeJourney }: ActiveJourneySidebarProps) {
  const { user, openAuthModal } = useAuth();
  const {
    journeys,
    clearJourney,
    reorderPlaces,
    focusedStep,
    setFocusedStep,
    focusedSegment,
    setFocusedSegment,
    setFocusBounds,
    isSyncing,
    alternativeSegment,
    setAlternativeSegment,
    setActiveJourney,
    isSearchMode,
    openSearchMode,
    closeSearchMode,
    addPlace,
    mapCenterAddress,
    setRecommendedPlaces,
    clearRecommendedPlaces,
  } = useJourneyStore();

  // ── 검색 모드 로컬 상태 ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // 검색 모드 진입/복귀 시 상태 초기화
  useEffect(() => {
    if (isSearchMode) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setTimeout(() => searchInputRef.current?.focus(), 150);
    } else {
      clearRecommendedPlaces();
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [isSearchMode, clearRecommendedPlaces]);

  // 이미 여정에 추가된 장소 ID 동기화
  useEffect(() => {
    setAddedIds(new Set((activeJourney.places || []).map(p => p.id)));
  }, [activeJourney.places]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setSearchResults([]);
      clearRecommendedPlaces();
      setSearchError(null);
      return;
    }
    setIsSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/places?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || '검색 실패');
        setSearchResults([]);
        clearRecommendedPlaces();
      } else {
        const items: PlaceResult[] = data.items || [];
        setSearchResults(items);
        setRecommendedPlaces(items);
      }
    } catch {
      setSearchError('네트워크 오류가 발생했습니다.');
      setSearchResults([]);
      clearRecommendedPlaces();
    } finally {
      setIsSearchLoading(false);
    }
  }, [clearRecommendedPlaces, setRecommendedPlaces]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => runSearch(val), 350);
  };

  const handleCategoryClick = async (category: string) => {
    const region = mapCenterAddress || '서울';
    const q = `${region} ${category}`;
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    await runSearch(q);
  };

  const handleAddSearchResult = async (item: PlaceResult) => {
    if (addedIds.has(item.id)) return;
    const place: Place = {
      id: item.id,
      place_name: item.place_name,
      address: item.address,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
    };
    setAddedIds(prev => new Set([...prev, item.id]));
    try {
      await addPlace(place);
    } catch {
      setAddedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  };

  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [localPlaces, setLocalPlaces] = useState<Place[]>([]);

  const queryClient = useQueryClient();

  // Reset isEditMode and selectedPlaceIds when activeJourney changes
  useEffect(() => {
    setIsEditMode(false);
    setSelectedPlaceIds([]);
  }, [activeJourney?.id]);

  // Sync localPlaces with activeJourney.places when not in edit mode
  useEffect(() => {
    if (!isEditMode && activeJourney?.places) {
      setLocalPlaces(activeJourney.places);
    }
  }, [activeJourney?.places, isEditMode]);

  useEffect(() => {
    setSelectedPlaceIds([]);
  }, [isEditMode]);

  const handleDeleteSelectedPlaces = async () => {
    if (selectedPlaceIds.length === 0 || !activeJourney) return;
    if (!confirm(`선택한 ${selectedPlaceIds.length}개의 장소를 삭제하시겠습니까?`)) {
      return;
    }
    try {
      const remainingPlaces = localPlaces.filter(
        (p) => !selectedPlaceIds.includes(p.id)
      );
      await reorderPlaces(remainingPlaces);
      setSelectedPlaceIds([]);
      setIsEditMode(false);
    } catch (err) {
      console.error('장소 삭제 실패:', err);
      alert('장소 삭제에 실패했습니다.');
    }
  };

  const handleDoneEdit = async () => {
    if (activeJourney) {
      try {
        await reorderPlaces(localPlaces);
      } catch (err) {
        console.error('순서 변경 저장 실패:', err);
        alert('순서 변경 저장에 실패했습니다.');
      }
    }
    setIsEditMode(false);
  };

  return (
    <>
      <aside className="w-[35%] min-w-[380px] max-w-[480px] h-full flex flex-col bg-white border-r border-zinc-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
        {/* ── 뮤직 플레이어 패널 스타일 헤더 (초소형 1줄 통합 버전) ── */}
        <header className={`flex flex-col border-b border-zinc-100/80 flex-shrink-0 relative overflow-hidden ${isEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-xl'}`}>
          
          {/* 왼쪽 상단 모서리: 뒤로가기 / 취소 */}
          <div className="absolute top-1.5 left-2 z-20">
            <button
              type="button"
              onClick={() => {
                if (isSearchMode) {
                  closeSearchMode();
                } else if (isEditMode) {
                  setIsEditMode(false);
                } else {
                  clearJourney();
                }
              }}
              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-700 transition-colors text-[11px] font-semibold rounded-md px-1 py-1"
            >
              {isEditMode && !isSearchMode ? (
                <div className="w-3.5 h-3.5" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              )}
              {isSearchMode ? '검색 종료' : isEditMode ? '취소' : '목록'}
            </button>
          </div>

          {/* 오른쪽 상단 모서리: 편집 및 동기화 */}
          <div className="absolute top-1.5 right-2 z-20 flex justify-end items-center gap-1">
            {isSyncing && (
              <div className="flex items-center" title="클라우드 동기화 중">
                <svg className="w-3 h-3 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
            )}
            <button
              type="button"
              onClick={isEditMode ? handleDoneEdit : () => setIsEditMode(true)}
              className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors px-1 py-1 ${isEditMode ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-700'}`}
            >
              {isEditMode ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  완료
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  편집
                </>
              )}
            </button>
          </div>

          {/* 중앙 바: 여정 정보 (버튼 사이에 위치) */}
          <div className="w-full flex justify-center px-16 pt-1">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="flex-1 flex flex-col items-center justify-center min-w-0 rounded-xl transition-all duration-300 hover:bg-zinc-50/80 cursor-pointer px-1 py-1 group border border-transparent hover:border-zinc-200/50"
              title="여정 정보 수정"
            >
              {/* 노래 제목 느낌 */}
              <div className="flex items-center justify-center max-w-full px-1">
                {/* 가운데 정렬 보정을 위한 빈 공간 (우측 연필 아이콘과 동일한 너비) */}
                <div className="w-3 h-3 mr-0.5 shrink-0" />
                
                <h2 className="text-sm font-black tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
                  {activeJourney.title}
                </h2>
                
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-all ml-0.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              </div>
              
              {/* 작사/작곡가 느낌 (생성 날짜 & 테마) */}
              <p className="text-[9px] font-medium text-zinc-400/80 mt-0.5 flex items-center gap-1 group-hover:text-zinc-500 transition-colors truncate max-w-full">
                <span className="truncate">{formatJourneyDate(activeJourney.journey_date)}</span>
                <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 shrink-0"></span>
                <span className="shrink-0">{activeJourney.transport_type === 'public' ? '대중교통' : activeJourney.transport_type === 'car' ? '차량' : '도보'}</span>
              </p>
            </button>
          </div>

          {/* 하단: 여정 이동 및 재생 조절 컨트롤 */}
          {!isEditMode && (() => {
            const isPlaying = !!focusedSegment || !!focusedStep;
            const activeIndex = journeys.findIndex(j => j.id === activeJourney.id);
            const prevJourney = activeIndex > 0 ? journeys[activeIndex - 1] : null;
            const nextJourney = activeIndex >= 0 && activeIndex < journeys.length - 1 ? journeys[activeIndex + 1] : null;

            return (
              <div className="flex items-center justify-center gap-6 pb-2.5 w-full">
                {/* 이전 여정 (<<) */}
                <button
                  type="button"
                  disabled={!prevJourney}
                  onClick={() => {
                    if (prevJourney) {
                      setFocusedStep(null);
                      setFocusedSegment(null);
                      setAlternativeSegment(null);
                      setFocusBounds(null);
                      setActiveJourney(prevJourney);
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none transition-colors"
                  title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M11.5 12l8.5 6V6l-8.5 6zM2 12l8.5 6V6L2 12z" />
                  </svg>
                </button>

                {/* 여정 재생/정지 */}
                {activeJourney.places.length >= 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isPlaying) {
                        setFocusedStep(null);
                        setFocusedSegment(null);
                        setAlternativeSegment(null);
                        setFocusBounds(null);
                      } else {
                        const firstPlace = activeJourney.places[0];
                        const secondPlace = activeJourney.places[1];

                        const queryKey = directionKeys.segment(firstPlace.id, secondPlace.id);
                        const segmentData = queryClient.getQueryData<any>(queryKey);
                        const transportType = activeJourney.transport_type || 'public';
                        const activeRoute = getDefaultRoute(firstPlace, secondPlace, segmentData, transportType as 'public' | 'car' | 'walk');

                        if (activeRoute) {
                          setFocusedSegment({ originId: firstPlace.id, destId: secondPlace.id });
                          setFocusedStep(null);

                          const bounds = calculateSegmentBounds(firstPlace, secondPlace, activeRoute);
                          setFocusBounds(bounds);
                        }
                      }
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 flex-shrink-0 ${isPlaying
                        ? 'bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-950 shadow-sm'
                        : 'bg-zinc-950 border border-zinc-800 hover:bg-zinc-900 text-white shadow-md'
                      }`}
                    title={isPlaying ? "전체 여정 보기 해제" : "전체 여정 재생"}
                  >
                    {isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                        <rect x="6" y="5" width="4" height="14" rx="1.5" />
                        <rect x="14" y="5" width="4" height="14" rx="1.5" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 ml-0.5">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-100 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 ml-0.5 text-zinc-300">
                      <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}

                {/* 다음 여정 (>>) */}
                <button
                  type="button"
                  disabled={!nextJourney}
                  onClick={() => {
                    if (nextJourney) {
                      setFocusedStep(null);
                      setFocusedSegment(null);
                      setAlternativeSegment(null);
                      setFocusBounds(null);
                      setActiveJourney(nextJourney);
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none transition-colors"
                  title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M12.5 12L4 6v12l8.5-6zM22 12l-8.5-6v12L22 12z" />
                  </svg>
                </button>
              </div>
            );
          })()}

          {/* 플레이어 하단 디자인 요소 (재생 바 같은 느낌) */}
          {!isEditMode && (() => {
            const isPlaying = !!focusedSegment || !!focusedStep;
            let totalSegments = 1;
            let activePlaceIndex = -1;
            let stepFraction = 0;
            
            if (activeJourney && activeJourney.places && activeJourney.places.length > 1) {
              totalSegments = activeJourney.places.length - 1;
              
              if (isPlaying) {
                const activeOriginId = focusedStep ? focusedStep.originId : focusedSegment?.originId;
                activePlaceIndex = activeJourney.places.findIndex((p: any) => p.id === activeOriginId);
                
                if (activePlaceIndex !== -1 && activePlaceIndex < totalSegments) {
                  if (focusedStep) {
                    const firstPlace = activeJourney.places[activePlaceIndex];
                    const secondPlace = activeJourney.places[activePlaceIndex + 1];
                    const queryKey = directionKeys.segment(firstPlace.id, secondPlace.id);
                    const segmentData = queryClient.getQueryData<any>(queryKey);
                    const transportType = activeJourney.transport_type || 'public';
                    const activeRoute = getDefaultRoute(firstPlace, secondPlace, segmentData, transportType as 'public' | 'car' | 'walk');

                    if (activeRoute && activeRoute.steps) {
                      const getPages = () => {
                        const arr: { idx: number, subType?: 'start' | 'end' | 'dest' }[] = [];
                        activeRoute.steps.forEach((step: any, idx: number) => {
                          if (step.type === 'walk' || (!step.startName && !step.endName)) {
                            arr.push({ idx });
                          } else {
                            if (step.startName) arr.push({ idx, subType: 'start' });
                            if (step.endName) arr.push({ idx, subType: 'end' });
                          }
                        });
                        arr.push({ idx: activeRoute.steps.length, subType: 'dest' });
                        return arr;
                      };
                      
                      const pages = getPages();
                      let currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex && p.subType === focusedStep.subType);
                      if (currentIdx === -1) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);
                      
                      const totalStepsNum = pages.length;
                      const currentStepNum = currentIdx >= 0 ? currentIdx + 1 : 0;
                      stepFraction = Math.min(1, Math.max(0, currentStepNum / totalStepsNum));
                    }
                  }
                }
              }
            }

            let progressPercent = 0;
            if (isPlaying && activePlaceIndex !== -1) {
              progressPercent = ((activePlaceIndex + stepFraction) / totalSegments) * 100;
            }

            return (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-100">
                <div 
                  className="h-full bg-gradient-to-r from-zinc-300 via-zinc-600 to-zinc-950 rounded-r-full shadow-[2px_0_8px_rgba(9,9,11,0.5)] transition-all duration-500 ease-out" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            );
          })()}
        </header>

        {/* ── 장소 목록 or 검색 모드 (스크롤 영역) ── */}
        {isSearchMode ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 검색 모드 헤더 */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0">
              {/* 검색바 */}
              <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-zinc-400 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); runSearch(searchQuery); }
                    if (e.key === 'Escape') closeSearchMode();
                  }}
                  placeholder={mapCenterAddress ? `${mapCenterAddress} 주변 장소 검색` : '방문할 장소를 검색해보세요'}
                  className="flex-1 bg-transparent outline-none text-zinc-800 placeholder-zinc-400 font-medium text-sm"
                />
                {isSearchLoading ? (
                  <svg className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : searchQuery.length > 0 ? (
                  <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); clearRecommendedPlaces(); searchInputRef.current?.focus(); }} className="w-4 h-4 flex-shrink-0 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-zinc-600"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                  </button>
                ) : null}
              </div>
              {/* 카테고리 칩 */}
              <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5 scrollbar-none select-none">
                {[{ label: '맛집 🍔', value: '맛집' }, { label: '카페 ☕', value: '카페' }, { label: '명소 🎪', value: '명소' }, { label: '숙소 🏨', value: '숙소' }].map(chip => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => handleCategoryClick(chip.value)}
                    className="px-3.5 py-1.5 rounded-full text-[11px] font-bold text-zinc-500 bg-zinc-50 border border-zinc-200/70 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-600 active:scale-95 transition-all duration-150 cursor-pointer whitespace-nowrap"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            {/* 검색 결과 리스트 */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-sidebar">
              {searchError ? (
                <p className="text-sm text-red-500 py-6 text-center">{searchError}</p>
              ) : searchResults.length === 0 && searchQuery.length > 0 && !isSearchLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  <p className="text-sm font-medium">검색 결과가 없습니다.</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                  <div className="text-3xl mb-3">🗺️</div>
                  <p className="text-sm font-semibold text-zinc-600 mb-1">장소를 검색하거나</p>
                  <p className="text-xs text-zinc-400">카테고리 버튼으로 주변 장소를 찾아보세요</p>
                </div>
              ) : (
                <ul className="space-y-1.5 pt-1">
                  {searchResults.map(item => {
                    const isAdded = addedIds.has(item.id);
                    const theme = getCategoryTheme(item.category);
                    const badgeColors: Record<string, string> = {
                      cafe: 'text-amber-700 bg-amber-50',
                      restaurant: 'text-rose-700 bg-rose-50',
                      hotel: 'text-emerald-700 bg-emerald-50',
                      activity: 'text-blue-700 bg-blue-50',
                      transit: 'text-zinc-700 bg-zinc-100',
                      etc: 'text-purple-700 bg-purple-50',
                    };
                    return (
                      <li key={item.id}>
                        <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isAdded ? 'bg-zinc-50 border-zinc-100' : 'bg-white border-zinc-100 hover:border-blue-100 hover:bg-blue-50/40'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-800 truncate">{item.place_name}</p>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">{item.address}</p>
                            {item.category && (
                              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 ${badgeColors[theme.type] || badgeColors.etc}`}>
                                {item.category.split('>').pop()?.trim() || item.category}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddSearchResult(item)}
                            disabled={isAdded}
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all font-bold text-xs cursor-pointer ${
                              isAdded
                                ? 'bg-green-50 text-green-600 cursor-default'
                                : 'bg-blue-100 hover:bg-blue-500 hover:text-white text-blue-600 active:scale-90'
                            }`}
                            title={isAdded ? '이미 추가됨' : '여정에 추가'}
                          >
                            {isAdded ? (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <PlaceList
            editMode={isEditMode}
            selectedIds={selectedPlaceIds}
            onToggleSelect={(id) => {
              setSelectedPlaceIds((prev) =>
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
              );
            }}
            localPlaces={localPlaces}
            setLocalPlaces={setLocalPlaces}
          />
        )}

        {/* ── 하단 고정: 장소 추가 or 삭제 버튼 ── */}
        {!isSearchMode && (
          <div className={`p-6 border-t border-zinc-100 flex-shrink-0 ${isEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-md'}`}>
            {isEditMode ? (
              <button
                type="button"
                onClick={handleDeleteSelectedPlaces}
                disabled={selectedPlaceIds.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all duration-300 flex justify-center items-center gap-2 ${selectedPlaceIds.length > 0
                  ? 'bg-red-600 hover:bg-red-700 text-white hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(220,38,38,0.15)] cursor-pointer shadow-sm'
                  : 'bg-zinc-100 text-zinc-300 cursor-default'
                  }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                <span className="tracking-wide">
                  {selectedPlaceIds.length > 0 ? `선택 삭제 (${selectedPlaceIds.length})` : '삭제'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openSearchMode}
                className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 relative z-10 transition-transform group-hover:rotate-90 duration-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="relative z-10 tracking-wide">장소 추가</span>
              </button>
            )}
          </div>
        )}
      </aside>

      <EditJourneyModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        journey={activeJourney}
      />
    </>
  );
}
