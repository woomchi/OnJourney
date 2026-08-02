"use client";

import { useMapUIStore } from '@/stores/map-store';
import { useMapState } from './useMapState';
import type { Place, PlaceResult } from '@/types/journey';

interface MapOverlaysProps {
  handleAddRecommendedPlace: (item: PlaceResult) => Promise<void>;
  handleRemoveRecommendedPlace: (placeId: string) => Promise<void>;
}

export function MapOverlays({
  handleAddRecommendedPlace,
  handleRemoveRecommendedPlace,
}: MapOverlaysProps) {
  const {
    activeJourney,
    isSearchMode,
    isSearchLoading,
    triggerSearch,
    hasSearchQuery,
    isDrawerMaximized,
    addPlace,
  } = useMapState();

  const {
    activeRecommendedPlace,
    setActiveRecommendedPlace,
    mapClickedPlace,
    setMapClickedPlace,
  } = useMapUIStore();

  const places = activeJourney?.places ?? [];

  return (
    <>
      {/* ── 현 지도에서 재검색 버튼 ── */}
      {isSearchMode && hasSearchQuery && (
        <div
          className={`absolute top-20 md:top-6 left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto transition-opacity duration-300 ${
            isDrawerMaximized ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              triggerSearch();
            }}
            disabled={isSearchLoading}
            className={`
              flex items-center gap-2 px-5 py-3 rounded-full font-bold text-[14px]
              shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06)]
              backdrop-blur-md transition-all duration-300 ease-out border
              ${
                isSearchLoading
                  ? 'bg-blue-500/90 text-white border-blue-400/50 scale-95 cursor-not-allowed'
                  : 'bg-white/90 text-blue-600 border-zinc-200/80 hover:bg-white hover:scale-105 hover:shadow-[0_8px_24px_rgba(59,130,246,0.15)] active:scale-95 cursor-pointer'
              }
            `}
          >
            {isSearchLoading ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="tracking-wide flex gap-0.5">
                  검색 중
                  <span className="animate-[bounce_1s_infinite_0ms]">.</span>
                  <span className="animate-[bounce_1s_infinite_200ms]">.</span>
                  <span className="animate-[bounce_1s_infinite_400ms]">.</span>
                </span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                <span className="tracking-wide">현재 화면에서 검색</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── 추천 장소 상세 오버레이 카드 ── */}
      {activeRecommendedPlace && (
        <div
          className={`absolute bottom-24 left-6 z-[120] w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4 transition-all ${
            isDrawerMaximized ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'
          }`}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mb-1">
                {activeRecommendedPlace.category.split('>').pop()?.trim() || activeRecommendedPlace.category}
              </span>
              <h4 className="text-[15px] font-black text-zinc-900 truncate leading-tight">
                {activeRecommendedPlace.place_name}
              </h4>
              <p className="text-xs text-zinc-400 mt-1 leading-normal truncate">
                {activeRecommendedPlace.address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveRecommendedPlace(null)}
              className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all flex-shrink-0 cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-3.5 h-3.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {(() => {
            const isAlreadyAdded = places.some((p) => p.id === activeRecommendedPlace.id);
            return isAlreadyAdded ? (
              <button
                type="button"
                onClick={() => handleRemoveRecommendedPlace(activeRecommendedPlace.id)}
                className="w-full py-3 bg-red-50 hover:bg-red-500 active:scale-95 text-red-600 hover:text-white text-xs font-bold rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-red-100 hover:border-red-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-3.5 h-3.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                <span>여정에서 제거하기</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAddRecommendedPlace(activeRecommendedPlace)}
                className="relative w-full py-3 bg-zinc-950 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-blue-600 before:to-indigo-600 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300 transition-all"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-3.5 h-3.5 relative z-10"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="relative z-10">장소 추가</span>
              </button>
            );
          })()}
        </div>
      )}

      {/* ── 지도에서 직접 클릭한 장소 오버레이 카드 ── */}
      {mapClickedPlace && (
        <div
          className={`absolute bottom-24 left-6 z-[120] w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4 transition-all ${
            isDrawerMaximized ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'
          }`}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full mb-1">
                직접 선택
              </span>
              <input
                type="text"
                value={mapClickedPlace.place_name}
                onChange={(e) => setMapClickedPlace({ ...mapClickedPlace, place_name: e.target.value })}
                className="w-full text-[15px] font-black text-zinc-900 leading-tight bg-transparent border-b border-zinc-200 focus:border-blue-500 outline-none pb-1"
                placeholder="장소 이름을 입력하세요"
                autoFocus
              />
              <p className="text-xs text-zinc-400 mt-2 leading-normal truncate">{mapClickedPlace.address}</p>
            </div>
            <button
              type="button"
              onClick={() => setMapClickedPlace(null)}
              className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all flex-shrink-0 cursor-pointer mt-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-3.5 h-3.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!activeJourney) return;
              const newId = 'custom_' + Date.now();
              const place: Place = {
                id: newId,
                place_name: mapClickedPlace.place_name || '지도에서 선택한 장소',
                address: mapClickedPlace.address,
                category: '사용자 추가',
                lat: mapClickedPlace.lat,
                lng: mapClickedPlace.lng,
              };
              try {
                await addPlace(place);

                const queriesStr = localStorage.getItem('onjourney_recent_queries');
                let recentQueries = [];
                if (queriesStr) recentQueries = JSON.parse(queriesStr);
                const trimmed = place.place_name.trim();
                if (trimmed) {
                  const next = [trimmed, ...recentQueries.filter((q: string) => q !== trimmed)].slice(0, 10);
                  localStorage.setItem('onjourney_recent_queries', JSON.stringify(next));
                }

                setMapClickedPlace(null);
              } catch (err) {
                console.error('장소 추가 실패:', err);
              }
            }}
            className="relative w-full py-3 bg-zinc-950 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-rose-600 before:to-orange-500 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300 transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-3.5 h-3.5 relative z-10"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="relative z-10">장소 추가</span>
          </button>
        </div>
      )}
    </>
  );
}
