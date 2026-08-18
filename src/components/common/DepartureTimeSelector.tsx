"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';

/**
 * 출발 예정 시각을 사용자가 수동 설정할 수 있도록 돕는 콤팩트 셀렉터 컴포넌트
 */
export default function DepartureTimeSelector() {
  const { departureTime, setDepartureTime } = useJourneyStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // datetime-local input 값 바인딩용 상태
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (departureTime) {
      const date = new Date(departureTime);
      // datetime-local의 포맷: YYYY-MM-DDTHH:mm
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      setInputValue(`${yyyy}-${mm}-${dd}T${hh}:${min}`);
    } else {
      // 지정 안 된 경우 현재 시각 기본 세팅
      const date = new Date();
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      setInputValue(`${yyyy}-${mm}-${dd}T${hh}:${min}`);
    }
  }, [departureTime]);

  // 바깥쪽 클릭 시 팝오버 닫기
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 표시 라벨 정의
  const getLabel = () => {
    if (!departureTime) return '지금 출발';
    const date = new Date(departureTime);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const rawHours = date.getHours();
    const min = String(date.getMinutes()).padStart(2, '0');
    const week = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];

    const period = rawHours < 12 ? '오전' : '오후';
    const hour12 = rawHours % 12 === 0 ? 12 : rawHours % 12;
    const hour24 = String(rawHours).padStart(2, '0');

    return `${mm}.${dd}(${week}) ${period} ${hour12}:${min} (${hour24}:${min}) 출발`;
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (val) {
      const timestamp = new Date(val).getTime();
      if (!isNaN(timestamp)) {
        setDepartureTime(timestamp);
      }
    }
  };

  const setNow = () => {
    setDepartureTime(null);
    setIsOpen(false);
  };

  // 현재 입력값의 오전/오후 텍스트 요약
  const getSelectedPreviewText = () => {
    if (!inputValue) return '';
    try {
      const [datePart, timePart] = inputValue.split('T');
      if (!timePart) return '';
      const [h, m] = timePart.split(':').map(Number);
      const period = h < 12 ? '오전' : '오후';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${datePart} ${period} ${h12}시 ${String(m).padStart(2, '0')}분 (${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')})`;
    } catch {
      return '';
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left z-[3000]">
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 focus:outline-none transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="max-w-[200px] truncate">{getLabel()}</span>
        <svg
          className="w-3.5 h-3.5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 팝오버 드롭다운 (아래 방향으로 열리도록 top-full mt-2 설정) */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl ring-1 ring-black/5 focus:outline-none p-4 transition-all z-[3000]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-xs font-bold text-gray-800">출발 시각 설정</span>
              <button
                type="button"
                onClick={setNow}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                지금 출발로 변경
              </button>
            </div>

            {/* 시각 변경 입력창 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-gray-400 font-semibold uppercase">날짜 및 시간 선택</label>
              <input
                type="datetime-local"
                value={inputValue}
                onChange={handleTimeChange}
                className="w-full px-2.5 py-1.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
              />
              {getSelectedPreviewText() && (
                <div className="text-[11px] font-semibold text-emerald-600 bg-emerald-50/70 px-2 py-1 rounded-md">
                  선택 시각: {getSelectedPreviewText()}
                </div>
              )}
            </div>

            <div className="text-[10px] text-gray-400 mt-1 leading-relaxed bg-zinc-50 p-2 rounded-lg border border-zinc-100">
              <span className="font-semibold text-zinc-600">안내</span>
              <ul className="list-disc pl-3 mt-1 space-y-0.5 text-zinc-500">
                <li>SRT/KTX, 고속/시외버스는 지정 시각 이후의 실시간 운행 시간표가 반영됩니다.</li>
                <li>시내버스/지하철은 지정 시각의 표준 운행 배차 간격 기준으로 최적 경로를 산출합니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
