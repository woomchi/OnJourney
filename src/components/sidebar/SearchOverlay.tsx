"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useJourneyStore } from '@/stores/journey-store';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import type { Journey, Place, PlaceResult } from '@/types/journey';
import { useShallow } from 'zustand/react/shallow';
import { MapPin, Search, X, Check, Clock, Plus, Loader2 } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface SearchOverlayProps {
  activeJourney: Journey;
}

function getDistrictPrefix(address: string) {
  if (!address) return '';
  const parts = address.trim().split(/\s+/);
  if (parts.length === 0) return '';

  const first = parts[0];
  // '도' 단위인 경우 (경기, 강원, 충남, 제주 등)
  const isProvince = first.endsWith('도') ||
    ['경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].includes(first);

  if (isProvince && parts.length >= 2) {
    // 도 단위는 시/군까지 묶어야 의미 있는 생활권이 됨 (예: "경기 성남시", "강원 영월군")
    return parts.slice(0, 2).join(' ');
  } else {
    // 서울, 부산, 대구 등 광역시/특별시는 그 자체로 하나의 거대 생활권이므로 구(구역)를 무시하고 묶음 (예: "서울", "부산")
    return first;
  }
}

export default function SearchOverlay({ activeJourney }: SearchOverlayProps) {
  const {
    isSearchMode,
    closeSearchMode,
    addPlace,
    removePlace,
    mapCenterAddress,
    mapCenterCoord,
    mapBounds,
    setRecommendedPlaces,
    clearRecommendedPlaces,
    activeSearchPlace,
    setActiveSearchPlace,
    setFocusBounds,
    isSearchLoading,
    setIsSearchLoading,
    searchTriggerCount,
    searchQuery,
    setSearchQuery,
  } = useJourneyStore(useShallow((state) => ({
    isSearchMode: state.isSearchMode,
    closeSearchMode: state.closeSearchMode,
    addPlace: state.addPlace,
    removePlace: state.removePlace,
    mapCenterAddress: state.mapCenterAddress,
    mapCenterCoord: state.mapCenterCoord,
    mapBounds: state.mapBounds,
    setRecommendedPlaces: state.setRecommendedPlaces,
    clearRecommendedPlaces: state.clearRecommendedPlaces,
    activeSearchPlace: state.activeSearchPlace,
    setActiveSearchPlace: state.setActiveSearchPlace,
    setFocusBounds: state.setFocusBounds,
    isSearchLoading: state.isSearchLoading,
    setIsSearchLoading: state.setIsSearchLoading,
    searchTriggerCount: state.searchTriggerCount,
    searchQuery: state.searchQuery,
    setSearchQuery: state.setSearchQuery,
  })));

  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('onjourney_recent_queries');
      if (saved) {
        try {
          setRecentQueries(JSON.parse(saved));
        } catch (e) { }
      }
    }
  }, []);

  useEffect(() => {
    if (activeSearchPlace && typeof window !== 'undefined') {
      const el = document.getElementById(`search-item-${activeSearchPlace.id}`);
      const container = document.getElementById('search-results-container');
      if (el && container) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const offsetTop = elRect.top - containerRect.top;

        container.scrollTo({
          top: container.scrollTop + offsetTop - 4, // 4px top padding
          behavior: 'smooth'
        });
      }
    }
  }, [activeSearchPlace]);

  // 외부(MapArea)에서 지도 영역 내 재검색 요청 시 처리
  useEffect(() => {
    if (searchTriggerCount > 0 && searchQuery.trim().length > 0) {
      runSearch(searchQuery, true);
    }
  }, [searchTriggerCount]);

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

  const runSearch = useCallback(async (q: string, isConfirmed: boolean = false) => {
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
      const boundsParam = mapBounds
        ? `&minLat=${mapBounds.minLat}&maxLat=${mapBounds.maxLat}&minLng=${mapBounds.minLng}&maxLng=${mapBounds.maxLng}`
        : '';
      const coordParam = mapCenterCoord ? `&lat=${mapCenterCoord.lat}&lng=${mapCenterCoord.lng}` : '';
      const transportParam = activeJourney?.transport_type
        ? `&transport_type=${activeJourney.transport_type}`
        : '';

      // 1차 검색: 현재 지도 영역 기반으로 정확도순 검색 (거리순 제외)
      let res = await fetch(`/api/places?query=${encodeURIComponent(q)}${boundsParam}${coordParam}${transportParam}`);
      if (currentSearchId !== activeSearchId.current) return;
      let payload = await res.json();
      let items: PlaceResult[] = [];

      if (!res.ok || !payload.success) {
        setSearchError(payload.error || '검색 실패');
        setSearchResults([]);
        clearRecommendedPlaces();
        return;
      } else {
        items = payload.data?.items || [];
      }

      // 1차 검색 결과가 15개 미만이라면(현재 지도 영역 내에 해당 장소가 부족함 = 특수한 고유명사일 확률이 높음), 범위를 넓혀 전국망 2차 검색 진행
      if (items.length < 15) {
        // coordParam은 남겨서 현 중심점 기준으로 가장 가까운 곳부터 우선 탐색되도록 유도하되 rect는 해제 (전국망 확장)
        const fallbackRes = await fetch(`/api/places?query=${encodeURIComponent(q)}${coordParam}${transportParam}`);
        if (currentSearchId !== activeSearchId.current) return;
        const fallbackPayload = await fallbackRes.json();

        if (fallbackRes.ok && fallbackPayload.success && fallbackPayload.data?.items && fallbackPayload.data.items.length > 0) {
          // 기존 로컬 결과와 전국망 결과를 합친 후 중복 제거
          const newItems = fallbackPayload.data.items as PlaceResult[];
          const merged = [...items, ...newItems];
          const uniqueItems = Array.from(new Map(merged.map(item => [item.id, item])).values());
          items = uniqueItems;
        } else if (items.length === 0) {
          setSearchError(fallbackPayload.error || '검색 결과가 없습니다.');
          setSearchResults([]);
          clearRecommendedPlaces();
          return;
        }
      }

      // 서버에서 전달한 composite score 기준 내림차순 최종 정렬
      items.sort((a, b) => (b.score || 0) - (a.score || 0));

      setSearchResults(items);
      setRecommendedPlaces(items);
      setSearchError(null);

      let exactMatchItem: PlaceResult | null = null;
      if (isConfirmed && items.length > 0) {
        const searchQ = q.replace(/\s+/g, '').toLowerCase();
        exactMatchItem = items.find(item => item.place_name.replace(/\s+/g, '').toLowerCase() === searchQ) || null;
      }

      if (isConfirmed && exactMatchItem) {
        // 완전 일치하는 항목이 있으면 해당 마커를 즉시 클릭(하이라이트)된 상태로 만듦
        setActiveSearchPlace(exactMatchItem);
      } else {
        // 검색 후 항상 기본적으로 선택 해제 상태로 시작
        setActiveSearchPlace(null);

        // 첫 번째 장소(1순위)를 중심으로 지도 줌 및 패닝 자동 조절 (확정 검색일 경우만)
        if (isConfirmed && items.length > 0) {
          const bestItem = items[0];
          // 반경 500m 수준의 적절한 줌 레벨로 맞춰지도록 작은 바운딩 박스 생성
          setFocusBounds({
            sw: { lat: bestItem.lat - 0.005, lng: bestItem.lng - 0.005 },
            ne: { lat: bestItem.lat + 0.005, lng: bestItem.lng + 0.005 }
          });
        }
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
  }, [clearRecommendedPlaces, setRecommendedPlaces, mapCenterCoord, mapBounds, activeJourney?.transport_type]);



  const searchInputRef = useRef<HTMLInputElement>(null);

  const debouncedRunSearch = useDebouncedCallback((val: string) => {
    runSearch(val, false);
  }, 350);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (val.trim().length === 0) {
      runSearch(val, false);
    } else if (val.trim().length >= 2) {
      debouncedRunSearch(val);
    }
  };

  const handleCategoryClick = async (category: string) => {
    setSearchQuery(category);
    debouncedRunSearch.cancel();
    await runSearch(category, true);
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
              if (e.key === 'Enter') { debouncedRunSearch.cancel(); runSearch(searchQuery, true); saveRecentQuery(searchQuery); }
              if (e.key === 'Escape') closeSearchMode();
            }}
            placeholder={mapCenterAddress ? `${mapCenterAddress} 주변 장소 검색` : '방문할 장소를 검색해보세요'}
            className="flex-1 bg-transparent outline-none text-zinc-800 placeholder-zinc-400 font-medium text-sm pl-1"
          />
          {isSearchLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0 mr-1" />
          ) : searchQuery.length > 0 ? (
            <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); clearRecommendedPlaces(); searchInputRef.current?.focus(); }} className="w-4 h-4 flex-shrink-0 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors cursor-pointer mr-1">
              <X className="w-2.5 h-2.5 text-zinc-600" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              debouncedRunSearch.cancel();
              runSearch(searchQuery, true);
              saveRecentQuery(searchQuery);
            }}
            className="flex-shrink-0 text-zinc-400 hover:text-blue-600 transition-colors cursor-pointer p-1 -mr-1"
          >
            <Search className="w-4 h-4" />
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
      <div
        id="search-results-container"
        className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-sidebar relative"
      >
        {searchError ? (
          <p className="text-sm text-red-500 py-6 text-center">{searchError}</p>
        ) : searchResults.length === 0 && searchQuery.length > 0 && !isSearchLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <MapPin className="w-8 h-8 mb-2 opacity-50" strokeWidth={1.5} />
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
                        runSearch(q, true);
                      }}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:text-blue-500 group-hover:bg-blue-100/50 transition-colors">
                        <Clock className="w-4 h-4" strokeWidth={2.5} />
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
                        <X className="w-4 h-4" />
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
                  id={`search-item-${item.id}`}
                  key={item.id}
                  onClick={() => {
                    if (activeSearchPlace?.id === item.id) {
                      setActiveSearchPlace(null);
                    } else {
                      setActiveSearchPlace(item);
                    }
                  }}
                  className={`cursor-pointer transition-all ${activeSearchPlace?.id === item.id ? 'ring-2 ring-blue-500 rounded-2xl' : ''}`}
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
                      onClick={(e) => { e.stopPropagation(); handleToggleSearchResult(item); }}
                      className={`group/btn flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all font-bold text-xs cursor-pointer ${isAdded
                        ? 'bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500'
                        : 'bg-blue-100 hover:bg-blue-500 hover:text-white text-blue-600 active:scale-90'
                        }`}
                      title={isAdded ? '여정에서 제거' : '여정에 추가'}
                    >
                      {isAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5 block group-hover/btn:hidden" strokeWidth={2.5} />
                          <X className="w-3.5 h-3.5 hidden group-hover/btn:block" strokeWidth={2.5} />
                        </>
                      ) : (
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
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
          <Check className="w-4 h-4 relative z-10 transition-transform group-hover:scale-110 duration-300" strokeWidth={2.5} />
          <span className="relative z-10 tracking-wide">닫기</span>
        </button>
      </div>
    </div>
  );
}
