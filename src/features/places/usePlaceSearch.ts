import { useState, useCallback, useMemo } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import type { PlaceResult, ServiceCategoryTag } from '@/types/journey';

export type CategoryFilterType = ServiceCategoryTag | 'all';

export function usePlaceSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryFilterType>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredResults = useMemo(() => {
    if (activeCategory === 'all') return results;
    return results.filter((item) => item.serviceCategory === activeCategory);
  }, [results, activeCategory]);

  const searchPlaces = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setIsOpen(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/places?query=${encodeURIComponent(q)}`);
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok || !payload?.success) {
        const errorMsg =
          typeof payload?.error === 'object'
            ? payload.error.message
            : payload?.error || '장소를 검색하는 중 오류가 발생했습니다.';
        setError(errorMsg);
        setResults([]);
      } else {
        setResults(payload.data?.items || []);
        setIsOpen(true);
      }
    } catch {
      setError('네트워크 연결 상태를 확인해주세요.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }

  }, []);

  const debouncedSearch = useDebouncedCallback((val: string) => {
    searchPlaces(val);
  }, 350);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    debouncedSearch(val);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setActiveCategory('all');
    setIsOpen(false);
    setError(null);
  };

  const cancelDebounce = () => {
    debouncedSearch.cancel();
  };

  return {
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
  };
}
