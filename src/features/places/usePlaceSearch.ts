import { useState, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export function usePlaceSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '검색 실패');
        setResults([]);
      } else {
        setResults(data.items || []);
        setIsOpen(true);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
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
