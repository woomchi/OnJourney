"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';

interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export default function AddPlaceModal() {
  const { isAddPlaceOpen, closeAddPlace, activeJourney, addPlace } = useJourneyStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이미 추가된 장소 ID 동기화
  useEffect(() => {
    if (activeJourney) {
      setAddedIds(new Set(activeJourney.places.map((p) => p.id)));
    }
  }, [activeJourney]);

  // 모달이 열릴 때 input에 포커스 주기
  useEffect(() => {
    if (isAddPlaceOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [isAddPlaceOpen]);

  const searchPlaces = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/places?query=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '검색 실패');
        setResults([]);
      } else {
        setResults(data.items || []);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchPlaces(val);
    }, 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchPlaces(query);
    }
  };

  const handleAddPlace = async (item: PlaceResult) => {
    if (!activeJourney) return;
    if (addedIds.has(item.id)) return;

    const place: Place = {
      id: item.id,
      place_name: item.place_name,
      address: item.address,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
    };

    setAddedIds((prev) => new Set([...prev, item.id]));
    closeAddPlace(); // Close modal immediately

    try {
      await addPlace(place);
    } catch {
      // 실패 시 롤백
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setError(null);
    inputRef.current?.focus();
  };

  if (!isAddPlaceOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
        onClick={closeAddPlace}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-md h-[520px] bg-white rounded-3xl shadow-2xl border border-zinc-100 p-8 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-place-title"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-2">
          <h2 id="add-place-title" className="text-2xl font-black text-zinc-900">
            장소 추가
          </h2>
          <button
            type="button"
            onClick={closeAddPlace}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 transition-colors"
            aria-label="닫기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-6">
          여정에 추가할 장소를 검색하고 클릭하여 추가해보세요.
        </p>

        {/* 검색창 */}
        <div className="relative mb-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-zinc-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="방문할 장소를 입력하세요"
              className="flex-1 bg-transparent outline-none text-zinc-800 placeholder-zinc-400 font-medium text-[15px]"
            />
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : query.length > 0 ? (
              <button
                type="button"
                onClick={handleClear}
                className="w-5 h-5 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center transition-colors"
                aria-label="지우기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-zinc-600">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {/* 결과 리스트 */}
        <div className="flex-1 overflow-y-auto pr-1">
          {error ? (
            <p className="text-sm text-red-500 py-4" role="alert">
              {error}
            </p>
          ) : results.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-12">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2 opacity-50">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              <p className="text-sm font-medium">검색 결과가 없습니다.</p>
            </div>
          ) : (
            <ul className="space-y-1.5 pb-2">
              {results.map((item) => {
                const isAdded = addedIds.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleAddPlace(item)}
                      disabled={isAdded}
                      className={`w-full text-left p-3 rounded-2xl transition-all flex flex-col items-start gap-1 border border-transparent ${
                        isAdded
                          ? 'opacity-55 cursor-default bg-zinc-50'
                          : 'hover:bg-blue-50/60 active:bg-blue-100/60 hover:border-blue-100 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="text-sm font-bold text-zinc-800 truncate">
                          {item.place_name}
                        </span>
                        {isAdded && (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
                            추가됨
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 truncate w-full">
                        {item.address}
                      </p>
                      {item.category && (
                        <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1">
                          {item.category.split('>').pop()?.trim() || item.category}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
