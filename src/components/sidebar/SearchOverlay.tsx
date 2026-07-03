"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { getCategoryTheme } from '@/lib/categoryUtils';
import type { Journey, Place, PlaceResult } from '@/types/journey';

interface SearchOverlayProps {
  activeJourney: Journey;
}

export default function SearchOverlay({ activeJourney }: SearchOverlayProps) {
  const {
    isSearchMode,
    closeSearchMode,
    addPlace,
    removePlace,
    mapCenterAddress,
    mapCenterCoord,
    setRecommendedPlaces,
    clearRecommendedPlaces,
    setHoveredSearchPlace,
  } = useJourneyStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const queries = localStorage.getItem('onjourney_recent_queries');
        if (queries) setRecentQueries(JSON.parse(queries));
      } catch (e) {
        console.error('Failed to load recent queries from localStorage:', e);
      }
    }
  }, []);

  const saveRecentQuery = useCallback((q: string) => {
    if (!q || q.trim().length === 0) return;
    const trimmed = q.trim();
    setRecentQueries(prev => {
      const next = [trimmed, ...prev.filter(item => item !== trimmed)].slice(0, 10);
      localStorage.setItem('onjourney_recent_queries', JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteRecentQuery = (q: string) => {
    setRecentQueries(prev => {
      const next = prev.filter(item => item !== q);
      localStorage.setItem('onjourney_recent_queries', JSON.stringify(next));
      return next;
    });
  };

  const clearRecentQueries = () => {
    setRecentQueries([]);
    localStorage.removeItem('onjourney_recent_queries');
  };

  const handleMouseEnterCard = useCallback((item: PlaceResult) => {
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    hoverDebounceRef.current = setTimeout(() => {
      setHoveredSearchPlace(item);
    }, 500); // 500ms delay
  }, [setHoveredSearchPlace]);

  const handleMouseLeaveCard = useCallback(() => {
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    setHoveredSearchPlace(null);
  }, [setHoveredSearchPlace]);

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
    setAddedIds(new Set((activeJourney?.places || []).map(p => p.id)));
  }, [activeJourney?.places]);

  const activeSearchId = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    const currentSearchId = ++activeSearchId.current;
    if (q.trim().length < 1) {
      setSearchResults([]);
      clearRecommendedPlaces();
      setSearchError(null);
      return;
    }
    setIsSearchLoading(true);
    setSearchError(null);
    try {
      const regionParam = mapCenterAddress ? `&region=${encodeURIComponent(mapCenterAddress)}` : '';
      const coordParam = mapCenterCoord ? `&lat=${mapCenterCoord.lat}&lng=${mapCenterCoord.lng}` : '';
      const res = await fetch(`/api/places?query=${encodeURIComponent(q)}${regionParam}${coordParam}`);
      if (currentSearchId !== activeSearchId.current) return;
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
      if (currentSearchId !== activeSearchId.current) return;
      setSearchError('네트워크 오류가 발생했습니다.');
      setSearchResults([]);
      clearRecommendedPlaces();
    } finally {
      if (currentSearchId === activeSearchId.current) {
        setIsSearchLoading(false);
      }
    }
  }, [clearRecommendedPlaces, setRecommendedPlaces, mapCenterAddress, mapCenterCoord]);

  // 지도가 이동할 때마다 '현 지도에서 재검색'을 자동으로 수행
  useEffect(() => {
    // 검색어가 있고 검색 모드일 때만 지도가 이동하면 재검색
    if (isSearchMode && searchQuery.trim().length > 0) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        runSearch(searchQuery);
      }, 600); // 지도를 연속으로 패닝할 수 있으므로 약간의 디바운스 부여
    }
  }, [mapCenterCoord, isSearchMode, searchQuery, runSearch]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => runSearch(val), 350);
  };

  const handleCategoryClick = async (category: string) => {
    setSearchQuery(category);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    await runSearch(category);
    saveRecentQuery(category);
  };

  const handleToggleSearchResult = async (item: PlaceResult) => {
    if (addedIds.has(item.id)) {
      setAddedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      try {
        await removePlace(item.id);
      } catch {
        setAddedIds(prev => new Set([...prev, item.id]));
      }
      return;
    }
    
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

  return (
    <div
      inert={!isSearchMode ? true : undefined}
      className={`absolute inset-0 bg-white z-50 flex flex-col min-h-0 transition-all duration-350 ease-in-out ${isSearchMode ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
    >
      {/* 검색 모드 헤더 */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0">
        {/* 검색바 */}
        <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20 transition-all">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); runSearch(searchQuery); saveRecentQuery(searchQuery); }
              if (e.key === 'Escape') closeSearchMode();
            }}
            placeholder={mapCenterAddress ? `${mapCenterAddress} 주변 장소 검색` : '방문할 장소를 검색해보세요'}
            className="flex-1 bg-transparent outline-none text-zinc-800 placeholder-zinc-400 font-medium text-sm pl-1"
          />
          {isSearchLoading ? (
            <svg className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : searchQuery.length > 0 ? (
            <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); clearRecommendedPlaces(); searchInputRef.current?.focus(); }} className="w-4 h-4 flex-shrink-0 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors cursor-pointer mr-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-zinc-600"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              runSearch(searchQuery);
              saveRecentQuery(searchQuery);
            }}
            className="flex-shrink-0 text-zinc-400 hover:text-blue-600 transition-colors cursor-pointer p-1 -mr-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
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
          <div className="space-y-6 py-4">
            {/* 최근 검색어 */}
            {recentQueries.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">최근 검색어</h3>
                  <button
                    type="button"
                    onClick={clearRecentQueries}
                    className="text-[10px] text-zinc-400 hover:text-red-500 font-semibold cursor-pointer transition-colors"
                  >
                    전체 삭제
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {recentQueries.map((q, idx) => (
                    <li
                      key={`rq-${idx}`}
                      className="group flex items-center gap-3 p-3 rounded-2xl border bg-white border-zinc-100 hover:border-blue-100 hover:bg-blue-50/40 transition-all cursor-pointer"
                      onClick={() => {
                        setSearchQuery(q);
                        runSearch(q);
                      }}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:text-blue-500 group-hover:bg-blue-100/50 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-700 truncate group-hover:text-zinc-900">{q}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteRecentQuery(q); }}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition-colors cursor-pointer"
                        title="기록 삭제"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 기본 가이드 */}
            {recentQueries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-400 border border-dashed border-zinc-200/70 rounded-3xl bg-zinc-50/50 mt-4 mx-1">
                <div className="text-3xl mb-3">🗺️</div>
                <p className="text-sm font-semibold text-zinc-600 mb-1">장소를 검색하거나 주변 장소를 찾아보세요</p>
                <p className="text-[11px] text-zinc-400">지도를 클릭하면 원하는 위치에 직접 핀을 꽂을 수도 있습니다</p>
              </div>
            )}
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
                <li
                  key={item.id}
                  onMouseEnter={() => handleMouseEnterCard(item)}
                  onMouseLeave={handleMouseLeaveCard}
                >
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
                      onClick={() => handleToggleSearchResult(item)}
                      className={`group/btn flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all font-bold text-xs cursor-pointer ${isAdded
                        ? 'bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500'
                        : 'bg-blue-100 hover:bg-blue-500 hover:text-white text-blue-600 active:scale-90'
                        }`}
                      title={isAdded ? '여정에서 제거' : '여정에 추가'}
                    >
                      {isAdded ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 block group-hover/btn:hidden">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 hidden group-hover/btn:block">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </>
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

      {/* 하단 고정: 선택 완료 버튼 */}
      <div className="p-6 border-t border-zinc-100 flex-shrink-0 bg-white/80 backdrop-blur-md">
        <button
          type="button"
          onClick={closeSearchMode}
          className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 relative z-10 transition-transform group-hover:scale-110 duration-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <span className="relative z-10 tracking-wide">닫기</span>
        </button>
      </div>
    </div>
  );
}
