"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useJourneyStore } from '@/stores/journey-store';
import { useAuth } from '@/providers/AuthProvider';
import { useDialog } from '@/providers/DialogProvider';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';
import type { Journey, Place, ServiceCategoryTag } from '@/types/journey';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { usePlaceSearch, CategoryFilterType } from '@/features/places/usePlaceSearch';
import { formatJourneyDate } from '@/lib/journeyUtils';
import { Search, Loader2, Plus, MapPin, X } from 'lucide-react';

const CATEGORY_CHIPS: { label: string; value: CategoryFilterType }[] = [
  { label: '전체', value: 'all' },
  { label: '관광명소', value: 'attraction' },
  { label: '음식점', value: 'restaurant' },
  { label: '카페', value: 'cafe' },
  { label: '숙소', value: 'accommodation' },
  { label: '교통', value: 'transit' },
  { label: '편의시설', value: 'convenience' },
  { label: '기타', value: 'etc' },
];

const themeClasses = {
  cafe: 'text-amber-700 bg-amber-50 border border-amber-100',
  restaurant: 'text-rose-700 bg-rose-50 border border-rose-100',
  hotel: 'text-emerald-700 bg-emerald-50 border border-emerald-100',
  activity: 'text-blue-700 bg-blue-50 border border-blue-100',
  transit: 'text-zinc-700 bg-zinc-50 border border-zinc-100',
  etc: 'text-purple-700 bg-purple-50 border border-purple-100'
};

interface PlaceSearchBarProps {
  onPlaceSelect?: (place: any) => void;
}


export default function PlaceSearchBar({ onPlaceSelect }: PlaceSearchBarProps) {
  const {
    query,
    setQuery,
    results,
    filteredResults,
    activeCategory,
    setActiveCategory,
    setResults,
    isLoading,
    isOpen,
    setIsOpen,
    error,
    searchPlaces,
    handleInputChange,
    handleClear,
    cancelDebounce,
  } = usePlaceSearch();

  const [isFocused, setIsFocused] = useState(false);

  // 선택한 장소를 추가할 여정 선택 모달 관련 상태
  const [selectedPlaceToAssign, setSelectedPlaceToAssign] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 0);
  }, []);

  const { user, openAuthModal } = useAuth();
  const { alert } = useDialog();
  const {
    activeJourney,
    addPlace,
    journeys,
    setJourneys,
    openCreateForm,
    setActiveJourney,
    isSearchMode,
    openSearchMode,
    setSearchQuery,
    triggerSearch,
    clearRecommendedPlaces,
    setActiveSearchPlace,
    searchQuery,
  } = useJourneyStore();

  // 이미 추가된 장소 ID 동기화 (파생 상태로 변경하여 Flicker 및 불필요한 렌더링 해결)
  const addedIds = useMemo(() => {
    return new Set(activeJourney?.places?.map((p) => p.id) || []);
  }, [activeJourney]);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기 및 포커스 해제 (모바일 키보드 내림)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Sync search input query with store's searchQuery in search mode
  useEffect(() => {
    if (isSearchMode) {
      setQuery(searchQuery);
    }
  }, [isSearchMode, searchQuery, setQuery]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim().length > 0) {
      cancelDebounce();
      if (activeJourney) {
        setSearchQuery(query);
        triggerSearch();
        if (!isSearchMode) {
          openSearchMode();
        }
        setIsOpen(false);
      } else {
        searchPlaces(query);
      }
      inputRef.current?.blur();
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit(e);
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const onClearInput = () => {
    handleClear();
    if (isSearchMode) {
      setSearchQuery('');
      clearRecommendedPlaces();
      setActiveSearchPlace(null);
    }
  };

  const handleAddPlace = async (item: any) => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (activeJourney) {
      if (addedIds.has(item.id)) return;

      const place: Place = {
        id: item.id,
        place_name: item.place_name,
        address: item.address,
        category: item.category,
        lat: item.lat,
        lng: item.lng,
      };

      onPlaceSelect?.(item);
      setIsOpen(false);
      setQuery('');
      setResults([]);
      inputRef.current?.blur();

      try {
        await addPlace(place);
      } catch (err) {
        console.error('장소 추가 실패:', err);
      }
    } else {
      // activeJourney가 null인 경우 여정 선택 모달 열기
      setSelectedPlaceToAssign(item);
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleAssignToJourney = async (journey: Journey) => {
    if (!selectedPlaceToAssign) return;

    const place: Place = {
      id: selectedPlaceToAssign.id,
      place_name: selectedPlaceToAssign.place_name,
      address: selectedPlaceToAssign.address,
      category: selectedPlaceToAssign.category,
      lat: selectedPlaceToAssign.lat,
      lng: selectedPlaceToAssign.lng,
    };

    // 해당 여정에 이미 장소가 있는지 확인
    const isAlreadyAdded = (journey.places || []).some((p) => p.id === place.id);
    if (isAlreadyAdded) {
      await alert('이미 해당 여정에 추가된 장소입니다.');
      return;
    }

    const updatedPlaces = [...(journey.places || []), place];
    const updatedJourney = { ...journey, places: updatedPlaces };

    // 낙관적 업데이트: store의 journeys 목록 갱신
    const updatedJourneys = journeys.map((j) => (j.id === journey.id ? updatedJourney : j));
    setJourneys(updatedJourneys);

    // 지도 줌 및 초점 이동
    onPlaceSelect?.(selectedPlaceToAssign);

    // 모달 닫기 및 검색바 초기화
    setSelectedPlaceToAssign(null);
    setQuery('');
    setResults([]);

    // 상세 뷰로 전환을 위해 activeJourney로 지정
    setActiveJourney(updatedJourney);

    // DB 동기화
    try {
      await updateJourneyPlaces(journey.id, updatedPlaces);
    } catch (err) {
      console.error('장소 추가 DB 연동 실패:', err);
      await alert('장소 추가에 실패했습니다.');
      // 실패 시 롤백
      const rolledBackJourneys = journeys.map((j) => (j.id === journey.id ? journey : j));
      setJourneys(rolledBackJourneys);
    }
  };


  const showDropdown = isOpen && (results.length > 0 || error !== null);

  return (
    <div ref={containerRef} className="relative w-full max-w-lg mx-auto">
      {/* 검색바 */}
      <form
        action=""
        onSubmit={handleSearchSubmit}
        onClick={() => {
          inputRef.current?.focus();
        }}
        className={`
          flex items-center gap-3 px-4 py-2
          bg-white/90 backdrop-blur-xl
          rounded-2xl border transition-all duration-300
          cursor-text
          ${isFocused
            ? 'border-blue-300 shadow-[0_8px_32px_rgba(59,130,246,0.18)] -translate-y-0.5'
            : 'border-zinc-300/80 shadow-[0_6px_24px_rgba(0,0,0,0.15)]'
          }
        `}
      >
        {/* 아이콘 */}
        <button
          type="submit"
          aria-label="검색"
          className={`flex-shrink-0 p-1.5 rounded-full transition-colors duration-200 cursor-pointer ${isFocused ? 'bg-blue-50' : 'bg-zinc-50'}`}
        >
          <Search className={`w-5 h-5 transition-colors duration-200 ${isFocused ? 'text-blue-600' : 'text-zinc-400'}`} strokeWidth={2} />
        </button>

        {/* 입력창 */}
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (activeJourney) {
              openSearchMode();
              inputRef.current?.blur();
              if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            } else {
              setIsFocused(true);
              if (results.length > 0) setIsOpen(true);
            }
          }}
          placeholder="방문할 장소를 검색해보세요"
          className="flex-1 bg-transparent outline-none text-zinc-800 placeholder-zinc-400 font-medium text-[15px] disabled:cursor-default disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />

        {/* 로딩 / 클리어 */}
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        ) : query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              onClearInput();
              inputRef.current?.focus();
            }}
            className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors"
            aria-label="검색어 지우기"
          >
            <X className="w-3 h-3 text-zinc-600" />
          </button>
        ) : null}
      </form>

      {/* 드롭다운 결과 */}
      {showDropdown && (
        <div
          className="
            absolute top-full left-0 right-0 mt-2 z-[150]
            bg-white/95 backdrop-blur-xl
            rounded-2xl border border-zinc-100
            shadow-[0_16px_48px_rgba(0,0,0,0.12)]
            overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-150
          "
        >
          {/* 카테고리 칩 필터 바 */}
          {results.length > 0 && (
            <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {CATEGORY_CHIPS.map((chip) => {
                const isActive = activeCategory === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setActiveCategory(chip.value)}
                    className={`
                      px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer
                      ${isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }
                    `}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}

          {error ? (
            <div className="px-5 py-4 text-sm text-red-500 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              {error}
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="px-5 py-6 text-sm text-zinc-400 text-center">
              {results.length > 0 ? '선택한 카테고리의 검색 결과가 없습니다.' : '검색 결과가 없습니다.'}
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-zinc-50 scrollbar-sleek">
              {filteredResults.map((item) => {
                const isAdded = activeJourney ? addedIds.has(item.id) : false;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleAddPlace(item)}
                      disabled={isAdded}
                      className={`
                        w-full flex items-start gap-3 px-5 py-3.5 text-left transition-all duration-150
                        ${isAdded
                          ? 'opacity-50 cursor-default bg-zinc-50'
                          : 'hover:bg-blue-50/60 active:bg-blue-100/60 cursor-pointer'
                        }
                      `}
                    >
                      <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" strokeWidth={0} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 truncate">
                          {item.place_name}
                        </p>
                        <p className="text-xs text-zinc-500 truncate mt-0.5">
                          {item.address}
                        </p>
                        {item.category && (() => {
                          const theme = getCategoryTheme(item.category);
                          const badgeClass = themeClasses[theme.type] || themeClasses.etc;
                          return (
                            <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
                              {item.category.split('>').pop()?.trim() || item.category}
                            </span>
                          );
                        })()}
                      </div>
                      {isAdded ? (
                        <span className="flex-shrink-0 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                          추가됨
                        </span>
                      ) : (
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-600 transition-colors">
                          <Plus className="w-4 h-4" strokeWidth={2.5} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {results.length > 0 && (
            <div className="px-5 py-2.5 border-t border-zinc-50 bg-zinc-50/50 flex justify-between items-center text-[11px] text-zinc-400">
              <span>장소 검색 결과 {results.length}개</span>
              {activeCategory !== 'all' && (
                <span className="font-medium text-blue-600">필터 적용: {filteredResults.length}개</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 여정 선택 모달 ── */}
      {selectedPlaceToAssign && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setSelectedPlaceToAssign(null)}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-100 p-8 flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
                여정 선택
              </h2>
              <button
                type="button"
                onClick={() => setSelectedPlaceToAssign(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
              <span className="font-bold text-blue-600">&quot;{selectedPlaceToAssign.place_name}&quot;</span>을(를) 추가할 여정을 선택해주세요.
            </p>

            {/* List or Fallback */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-sleek">
              {journeys.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-zinc-700">생성된 여정이 없습니다.</p>
                  <p className="text-xs text-zinc-400 mt-1 mb-6">장소를 추가하기 위해 새 여정을 먼저 생성해주세요.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlaceToAssign(null);
                      openCreateForm();
                    }}
                    className="relative group py-3 px-6 bg-zinc-900 rounded-xl text-white font-bold text-sm transition-all duration-300 hover:scale-[1.02] flex items-center justify-center gap-2 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10">새 여정 생성하기</span>
                  </button>
                </div>
              ) : (
                <ul className="space-y-2.5 pb-2">
                  {journeys.map((journey) => (
                    <li key={journey.id}>
                      <button
                        type="button"
                        onClick={() => handleAssignToJourney(journey)}
                        className="w-full text-left p-4 rounded-2xl border border-zinc-100 hover:border-blue-100 hover:bg-blue-50/40 active:bg-blue-100/40 transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-zinc-800 truncate group-hover:text-blue-600 transition-colors">
                            {journey.title}
                          </h4>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {formatJourneyDate(journey.journey_date)} · {journey.transport_type === 'public' ? '대중교통' : '차량'}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 group-hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors">
                          장소 {journey.places?.length ?? 0}개
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
