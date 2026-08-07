"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useJourneyStore } from '@/stores/journey-store';
import { useMapUIStore } from '@/stores/map-store';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import type { Journey, Place, PlaceResult } from '@/types/journey';
import { useShallow } from 'zustand/react/shallow';
import { MapPin, Search, X, Check, Clock, Plus, Loader2, RefreshCw } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSnapScrollBridge } from '@/hooks/ui/useSnapScrollBridge';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { useDialog } from '@/providers/DialogProvider';
import { MAX_JOURNEY_PLACES, MAX_JOURNEY_PLACES_ALERT } from '@/constants/journey';

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
    first.endsWith('특별자치도');
  const second = parts[1];

  if (isProvince && second) {
    return `${first.slice(0, 2)} ${second}`;
  }
  return first;
}

export default function SearchOverlay({ activeJourney }: SearchOverlayProps) {
  const {
    isSearchMode,
    addPlace,
    removePlace,
    mapCenterAddress,
    mapCenterCoord,
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
    drawerSnapPoint,
    setDrawerSnapPoint,
    isDrawerMaximized,
    targetChangePlaceId,
    setTargetChangePlaceId,
    updatePlace,
    closeSearchMode,
  } = useJourneyStore(useShallow((state) => ({
    isSearchMode: state.isSearchMode,
    addPlace: state.addPlace,
    removePlace: state.removePlace,
    mapCenterAddress: state.mapCenterAddress,
    mapCenterCoord: state.mapCenterCoord,
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
    drawerSnapPoint: state.drawerSnapPoint,
    setDrawerSnapPoint: state.setDrawerSnapPoint,
    isDrawerMaximized: state.isDrawerMaximized,
    targetChangePlaceId: state.targetChangePlaceId,
    setTargetChangePlaceId: state.setTargetChangePlaceId,
    updatePlace: state.updatePlace,
    closeSearchMode: state.closeSearchMode,
  })));

  const { alert } = useDialog();

  const isMapDragging = useMapUIStore((state) => state.isMapDragging);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recentTagsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchHeaderRef = useRef<HTMLDivElement>(null);
  const [windowHeight, setWindowHeight] = useState(0);

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftPos, setScrollLeftPos] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  useEffect(() => {
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (searchHeaderRef.current && !searchHeaderRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const minSnapPx = isSearchMode ? (recentQueries.length > 0 ? 114 : 74) : (activeJourney ? 133 : 62);
  const defaultSnapPx = isSearchMode
    ? (windowHeight ? Math.round(windowHeight * 0.62) : 500)
    : (activeJourney ? 370 : 360);

  const {
    handlePointerDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel,
  } = useSnapScrollBridge({
    scrollRef,
    drawerSnapPoint,
    isDrawerMaximized,
    setDrawerSnapPoint,
    activeJourney,
    minSnap: minSnapPx,
    defaultSnap: defaultSnapPx,
    disabled: !isMobile,
  });

  const bottomSheet = useOptionalBottomSheet();

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const isInteractive = (e.target as HTMLElement).closest('input, button, a, [role="button"]');
    if (!isInteractive && bottomSheet) {
      bottomSheet.dragControls.start(e);
    } else {
      e.stopPropagation();
    }
  };

  const handleHeaderTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    const isInteractive = (e.target as HTMLElement).closest('input, button, a, [role="button"]');
    if (isInteractive) {
      e.stopPropagation();
    }
  };

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
      setSuggestions([]);
      setIsDropdownOpen(false);
      setHasSearched(false);
      setSearchError(null);
      setTimeout(() => searchInputRef.current?.focus(), 150);
    } else {
      clearRecommendedPlaces();
      setActiveSearchPlace(null);
      setSearchResults([]);
      setSuggestions([]);
      setIsDropdownOpen(false);
      setHasSearched(false);
      setSearchQuery('');
    }
  }, [isSearchMode, clearRecommendedPlaces, setActiveSearchPlace, setSearchQuery, setSearchResults]);

  // 이미 여정에 추가된 장소 ID 동기화
  useEffect(() => {
    setAddedIds(new Set((activeJourney?.places || []).map(p => p.id)));
  }, [activeJourney?.places]);

  const activeSearchId = useRef(0);
  const activeSuggestionId = useRef(0);

  // 1. 입력 중 추천 검색어(자동완성) 드롭다운용 API 조회
  const fetchSuggestions = useCallback(async (q: string) => {
    const currentSuggestionId = ++activeSuggestionId.current;
    if (q.trim().length < 1) {
      setSuggestions([]);
      setIsDropdownOpen(false);
      return;
    }
    setIsSuggestionsLoading(true);
    try {
      const currentBounds = useJourneyStore.getState().mapBounds;
      const boundsParam = currentBounds
        ? `&minLat=${currentBounds.minLat}&maxLat=${currentBounds.maxLat}&minLng=${currentBounds.minLng}&maxLng=${currentBounds.maxLng}`
        : '';
      const coordParam = mapCenterCoord ? `&lat=${mapCenterCoord.lat}&lng=${mapCenterCoord.lng}` : '';
      const transportParam = activeJourney?.transport_type
        ? `&transport_type=${activeJourney.transport_type}`
        : '';

      let res = await fetch(`/api/places?query=${encodeURIComponent(q)}${boundsParam}${coordParam}${transportParam}`);
      if (currentSuggestionId !== activeSuggestionId.current) return;
      let payload = await res.json();
      let items: PlaceResult[] = payload.data?.items || [];

      if (items.length < 3) {
        const fallbackRes = await fetch(`/api/places?query=${encodeURIComponent(q)}${coordParam}${transportParam}`);
        if (currentSuggestionId !== activeSuggestionId.current) return;
        const fallbackPayload = await fallbackRes.json();
        if (fallbackRes.ok && fallbackPayload.success && fallbackPayload.data?.items) {
          const merged = [...items, ...fallbackPayload.data.items];
          items = Array.from(new Map(merged.map(item => [item.id, item])).values());
        }
      }

      items.sort((a, b) => (b.score || 0) - (a.score || 0));
      setSuggestions(items);
      setIsDropdownOpen(items.length > 0);
    } catch {
      if (currentSuggestionId !== activeSuggestionId.current) return;
      setSuggestions([]);
    } finally {
      if (currentSuggestionId === activeSuggestionId.current) {
        setIsSuggestionsLoading(false);
      }
    }
  }, [mapCenterCoord, activeJourney?.transport_type]);

  const debouncedFetchSuggestions = useDebouncedCallback((val: string) => {
    fetchSuggestions(val);
  }, 300);

  // 2. 검색 확정 실행 (Enter, 검색 버튼, 드롭다운 클릭, 최근검색어 태그 클릭)
  const runSearch = useCallback(async (q: string, triggerMapHighlight: boolean = true) => {
    const currentSearchId = ++activeSearchId.current;
    if (q.trim().length < 1) {
      setSearchResults([]);
      clearRecommendedPlaces();
      setActiveSearchPlace(null);
      setSearchError(null);
      setHasSearched(false);
      return;
    }

    setIsDropdownOpen(false);
    debouncedFetchSuggestions.cancel();
    setIsSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const currentBounds = useJourneyStore.getState().mapBounds;
      const boundsParam = currentBounds
        ? `&minLat=${currentBounds.minLat}&maxLat=${currentBounds.maxLat}&minLng=${currentBounds.minLng}&maxLng=${currentBounds.maxLng}`
        : '';
      const coordParam = mapCenterCoord ? `&lat=${mapCenterCoord.lat}&lng=${mapCenterCoord.lng}` : '';
      const transportParam = activeJourney?.transport_type
        ? `&transport_type=${activeJourney.transport_type}`
        : '';

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

      if (items.length < 3) {
        const fallbackRes = await fetch(`/api/places?query=${encodeURIComponent(q)}${coordParam}${transportParam}`);
        if (currentSearchId !== activeSearchId.current) return;
        const fallbackPayload = await fallbackRes.json();

        if (fallbackRes.ok && fallbackPayload.success && fallbackPayload.data?.items && fallbackPayload.data.items.length > 0) {
          const newItems = fallbackPayload.data.items as PlaceResult[];
          const merged = [...items, ...newItems];
          items = Array.from(new Map(merged.map(item => [item.id, item])).values());
        } else if (items.length === 0) {
          setSearchError(fallbackPayload.error || '검색 결과가 없습니다.');
          setSearchResults([]);
          clearRecommendedPlaces();
          return;
        }
      }

      items.sort((a, b) => (b.score || 0) - (a.score || 0));

      setSearchResults(items);
      setSearchError(null);

      if (typeof window !== 'undefined') {
        setDrawerSnapPoint(Math.round(window.innerHeight * 0.62));
      }

      if (triggerMapHighlight) {
        setRecommendedPlaces(items);

        if (items.length > 0) {
          const bestItem = items[0];
          setFocusBounds({
            sw: { lat: bestItem.lat - 0.005, lng: bestItem.lng - 0.005 },
            ne: { lat: bestItem.lat + 0.005, lng: bestItem.lng + 0.005 }
          });
          setActiveSearchPlace(bestItem);
        } else {
          setActiveSearchPlace(null);
        }
      } else {
        clearRecommendedPlaces();
        setActiveSearchPlace(null);
      }
    } catch {
      if (currentSearchId !== activeSearchId.current) return;
      setSearchError('네트워크 오류가 발생했습니다.');
      setSearchResults([]);
      clearRecommendedPlaces();
      setActiveSearchPlace(null);
    } finally {
      if (currentSearchId === activeSearchId.current) {
        setIsSearchLoading(false);
      }
    }
  }, [clearRecommendedPlaces, setRecommendedPlaces, setActiveSearchPlace, setFocusBounds, mapCenterCoord, activeJourney?.transport_type, setDrawerSnapPoint, debouncedFetchSuggestions]);

  const dismissKeyboard = useCallback(() => {
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (val.trim().length === 0) {
      debouncedFetchSuggestions.cancel();
      setSuggestions([]);
      setIsDropdownOpen(false);
    } else {
      debouncedFetchSuggestions(val);
    }
  };

  const handleTagClick = useCallback((q: string) => {
    if (hasDragged) return;
    dismissKeyboard();
    setSearchQuery(q);
    debouncedFetchSuggestions.cancel();
    runSearch(q, true);
    saveRecentQuery(q);
    if (typeof window !== 'undefined') {
      setDrawerSnapPoint(Math.round(window.innerHeight * 0.62));
    }
  }, [hasDragged, dismissKeyboard, setSearchQuery, debouncedFetchSuggestions, runSearch, saveRecentQuery, setDrawerSnapPoint]);

  const handleSelectSuggestion = (item: PlaceResult) => {
    dismissKeyboard();
    setSearchQuery(item.place_name);
    setIsDropdownOpen(false);
    debouncedFetchSuggestions.cancel();
    saveRecentQuery(item.place_name);

    // 추천 항목을 선택했을 때 해당 항목을 바로 마커/줌 하이라이트 및 카드 생성
    runSearch(item.place_name, true);
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    dismissKeyboard();
    if (searchQuery.trim().length > 0) {
      debouncedFetchSuggestions.cancel();
      saveRecentQuery(searchQuery);
      runSearch(searchQuery, true);
      if (typeof window !== 'undefined') {
        setDrawerSnapPoint(Math.round(window.innerHeight * 0.62));
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit(e);
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      dismissKeyboard();
    }
  };

  const handleClearInput = () => {
    setSearchQuery('');
    debouncedFetchSuggestions.cancel();
    setSuggestions([]);
    setIsDropdownOpen(false);
    setSearchResults([]);
    setHasSearched(false);
    clearRecommendedPlaces();
    setActiveSearchPlace(null);
    setSearchError(null);
    searchInputRef.current?.focus();
  };

  const targetChangePlace = activeJourney?.places.find(p => p.id === targetChangePlaceId);

  const handleToggleSearchResult = async (item: PlaceResult) => {
    const place: Place = {
      id: item.id,
      place_name: item.place_name,
      address: item.address,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
    };

    if (targetChangePlaceId) {
      try {
        await updatePlace(targetChangePlaceId, place);
        closeSearchMode();
      } catch (err) {
        console.error('장소 변경 실패:', err);
      }
      return;
    }

    if (!targetChangePlaceId && !addedIds.has(item.id)) {
      if ((activeJourney?.places?.length ?? 0) >= MAX_JOURNEY_PLACES) {
        await alert(MAX_JOURNEY_PLACES_ALERT);
        return;
      }
    }

    if (addedIds.has(item.id)) {
      setAddedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      try {
        await removePlace(item.id);
      } catch {
        setAddedIds(prev => new Set([...prev, item.id]));
      }
      return;
    }

    setAddedIds(prev => new Set([...prev, item.id]));
    try {
      await addPlace(place);
    } catch {
      setAddedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  };

  const isMaxPlacesReached = (activeJourney?.places?.length ?? 0) >= MAX_JOURNEY_PLACES;

  return (
    <div
      inert={!isSearchMode ? true : undefined}
      className={`absolute inset-0 bg-white z-50 flex flex-col min-h-0 transition duration-350 ease-in-out ${isSearchMode ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
    >
      {/* ── 검색 헤더 (검색 입력창 + 드롭다운 추천 검색어 + 가로형 검색 내역/추천 태그) ── */}
      <div
        ref={searchHeaderRef}
        onPointerDown={handleHeaderPointerDown}
        onTouchStart={handleHeaderTouchStart}
        className="flex-shrink-0 bg-white border-b border-zinc-100 flex flex-col select-none z-20 cursor-grab active:cursor-grabbing relative"
      >
        {/* 검색 입력 바 */}
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 relative">
          {targetChangePlaceId && (
            <button
              type="button"
              onClick={closeSearchMode}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="px-3 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer shrink-0"
              title="장소 검색 닫기"
              aria-label="장소 검색 닫기"
            >
              닫기
            </button>
          )}
          <form
            action=""
            onSubmit={handleSearchSubmit}
            className="flex-1 flex items-center gap-2 px-3.5 py-2.5 bg-zinc-100/90 rounded-2xl border border-zinc-200/60 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 transition-all"
          >
            <button
              type="submit"
              aria-label="검색"
              className="flex items-center justify-center p-0 border-none bg-transparent cursor-pointer flex-shrink-0"
            >
              <Search className="w-4 h-4 text-zinc-400" strokeWidth={2.5} />
            </button>
            <input
              ref={searchInputRef}
              type="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setIsDropdownOpen(true);
              }}
              placeholder="방문할 장소를 검색해보세요"
              className="flex-1 bg-transparent outline-none text-sm text-zinc-800 placeholder-zinc-400 font-semibold [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
            />
            {isSearchLoading || isSuggestionsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
            ) : searchQuery.length > 0 ? (
              <button
                type="button"
                onClick={handleClearInput}
                className="w-4.5 h-4.5 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center text-zinc-500 hover:text-zinc-700 transition-colors flex-shrink-0 cursor-pointer"
                title="검색어 지우기"
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            ) : null}
          </form>

          {isDropdownOpen && suggestions.length > 0 && (
            <div
              className={`absolute top-full left-4 right-4 mt-1 z-[100] ${isMapDragging ? 'bg-white backdrop-blur-none' : 'bg-white/95 backdrop-blur-xl'} rounded-2xl border border-zinc-200/80 shadow-[0_12px_36px_rgba(0,0,0,0.14)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150`}
            >
              <ul className="max-h-64 overflow-y-auto divide-y divide-zinc-50 scrollbar-sleek">
                {suggestions.map((item) => {
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
                    <li key={`sugg-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-blue-50/60 active:bg-blue-100/60 transition-colors cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-zinc-800 truncate">
                            {item.place_name}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {item.address}
                          </p>
                          {item.category && (
                            <span className={`inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${badgeColors[theme.type] || badgeColors.etc}`}>
                              {item.category.split('>').pop()?.trim() || item.category}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50/60 flex items-center justify-between">
                <span className="text-[10px] font-medium text-zinc-400">추천 검색어</span>
                <span className="text-[10px] text-zinc-400">클릭 시 검색 실행</span>
              </div>
            </div>
          )}
        </div>

        {/* 가로형 최근 검색 내역 태그 (검색바 바로 아래 배치) */}
        {recentQueries.length > 0 && (
          <div className="flex items-center px-4 pb-3 pt-0.5 select-none relative">
            <button
              type="button"
              onClick={clearRecentQueries}
              className="flex-shrink-0 text-[11px] font-semibold text-zinc-400 hover:text-red-500 bg-white py-1 pr-3 transition-colors cursor-pointer whitespace-nowrap z-10"
              title="최근 검색어 전체 삭제"
            >
              전체 삭제
            </button>
            <div
              ref={recentTagsRef}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onWheel={(e) => {
                if (recentTagsRef.current && e.deltaY !== 0) {
                  recentTagsRef.current.scrollLeft += e.deltaY;
                }
              }}
              onMouseDown={(e) => {
                if (!recentTagsRef.current) return;
                setIsMouseDown(true);
                setHasDragged(false);
                setStartX(e.pageX - recentTagsRef.current.offsetLeft);
                setScrollLeftPos(recentTagsRef.current.scrollLeft);
              }}
              onMouseLeave={() => setIsMouseDown(false)}
              onMouseUp={() => setIsMouseDown(false)}
              onMouseMove={(e) => {
                if (!isMouseDown || !recentTagsRef.current) return;
                const x = e.pageX - recentTagsRef.current.offsetLeft;
                const walk = (x - startX) * 1.2;
                if (Math.abs(walk) > 5) setHasDragged(true);
                recentTagsRef.current.scrollLeft = scrollLeftPos - walk;
              }}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none [touch-action:pan-x] overscroll-x-contain cursor-grab active:cursor-grabbing min-w-0"
            >
              {recentQueries.map((q, idx) => (
                <div
                  key={`rq-tag-${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTagClick(q);
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-blue-50 hover:text-blue-600 border border-zinc-200/60 hover:border-blue-200 text-zinc-700 text-xs font-bold rounded-full transition-all cursor-pointer group"
                >
                  <Clock className="w-3 h-3 text-zinc-400 group-hover:text-blue-500 flex-shrink-0" strokeWidth={2.2} />
                  <span>{q}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRecentQuery(q);
                    }}
                    className="w-3.5 h-3.5 rounded-full hover:bg-zinc-200 hover:text-zinc-600 flex items-center justify-center text-zinc-400 transition-colors cursor-pointer -mr-0.5"
                    title="기록 삭제"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 검색 결과 리스트 (검색 실행 시에만 생성되는 카드) ── */}
      <div
        ref={scrollRef}
        id="search-results-container"
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-sidebar relative overscroll-none"
      >
        {searchError ? (
          <p className="text-sm text-red-500 py-6 text-center">{searchError}</p>
        ) : searchResults.length === 0 && hasSearched && !isSearchLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <MapPin className="w-8 h-8 mb-2 opacity-50" strokeWidth={1.5} />
            <p className="text-sm font-medium">검색 결과가 없습니다.</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="py-4 space-y-4">
            {/* 기본 가이드 */}
            <div className="flex flex-col items-center justify-center py-8 px-4 text-zinc-400 border border-dashed border-zinc-200/70 rounded-3xl bg-zinc-50/50 mx-1 text-center">
              <div className="text-3xl mb-2">🗺️</div>
              <p className="text-sm font-semibold text-zinc-600 mb-1">방문할 장소를 검색해보세요</p>
              <p className="text-[11px] text-zinc-400">검색어를 입력 후 Enter 또는 클릭하면 결과 카드가 생성됩니다</p>
            </div>
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
                    dismissKeyboard();
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
                      className={`group/btn flex-shrink-0 transition-all font-bold text-xs cursor-pointer ${targetChangePlaceId
                          ? 'px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 active:scale-95 shadow-xs'
                          : isAdded
                            ? 'w-8 h-8 rounded-full flex items-center justify-center bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500'
                            : 'w-8 h-8 rounded-full flex items-center justify-center bg-blue-100 hover:bg-blue-500 hover:text-white text-blue-600 active:scale-90'
                        }`}
                      title={targetChangePlaceId ? '이 장소로 변경' : isAdded ? '여정에서 제거' : '여정에 추가'}
                    >
                      {targetChangePlaceId ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>변경</span>
                        </>
                      ) : isAdded ? (
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

    </div>
  );

}
