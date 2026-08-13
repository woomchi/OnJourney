'use client';

import React from 'react';
import { RealtimeArrivalCard } from '@/components/transit/RealtimeArrivalCard';

export default function TransitDemoPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center space-y-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          실시간 대중교통 도착 정보 데모
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          국토교통부 TAGO API 주축 + 시도별 보완 API 연동 (15초 자동 갱신)
        </p>
      </div>

      <div className="w-full flex flex-col items-center space-y-4">
        {/* 서울 정류장 데모 */}
        <RealtimeArrivalCard
          region="seoul"
          stationId="WDB000000015"
          stationName="당산역"
        />

        {/* 경기 정류장 데모 (TAGO + 경기 머지) */}
        <RealtimeArrivalCard
          region="gyeonggi"
          stationId="234000010"
          stationName="강남역"
        />
      </div>
    </div>
  );
}
