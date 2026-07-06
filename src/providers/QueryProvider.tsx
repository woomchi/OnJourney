'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 60 * 24, // 24시간 동안 캐시 유지 (오프라인 대응)
            gcTime: 1000 * 60 * 60 * 24 * 7, // 7일간 캐시 보관
            retry: 1, // 실패 시 1회 재시도
            refetchOnWindowFocus: false, // 윈도우 포커스 시 자동 재요청 방지
          },
        },
      })
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const persister = createAsyncStoragePersister({
        storage: {
          getItem: async (key) => {
            const value = await get(key);
            return value === undefined ? null : value;
          },
          setItem: async (key, value) => {
            await set(key, value);
          },
          removeItem: async (key) => {
            await del(key);
          },
        },
        key: 'ONJOURNEY_REACT_QUERY_CACHE',
      });
      
      const [, restorePromise] = persistQueryClient({
        queryClient,
        persister,
      });

      restorePromise.then(() => {
        import('@/stores/journey-store').then(({ useJourneyStore }) => {
          useJourneyStore.getState().setCacheRestored(true);
        });
      });
    }
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* 
        process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-right" />
        )
      */}
    </QueryClientProvider>
  );
}
