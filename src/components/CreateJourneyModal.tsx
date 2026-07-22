"use client";

import { useState, type FormEvent } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { TransportType } from '@/types/journey';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';

const TRANSPORT_OPTIONS = [
  { value: 'public' as const, label: '대중교통', icon: '🚌' },
  { value: 'car' as const, label: '차량', icon: '🚗' },
  { value: 'walk' as const, label: '도보', icon: '🚶' },
];

export default function CreateJourneyModal() {
  const queryClient = useQueryClient();
  const { isCreateFormOpen, closeCreateForm, createJourney, isLoading } =
    useJourneyStore();

  const [title, setTitle] = useState('');
  const [transportType, setTransportType] = useState<TransportType>('public');
  const [journeyDate, setJourneyDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('여정명을 입력해주세요.');
      return;
    }
    if (!journeyDate) {
      setError('여정 날짜를 선택해주세요.');
      return;
    }

    setError('');

    try {
      await createJourney({
        title,
        transport_type: transportType,
        journey_date: journeyDate,
      });
      queryClient.invalidateQueries({ queryKey: ['journeys'] });

      setTitle('');
      setTransportType('public');
      setJourneyDate(new Date().toISOString().slice(0, 10));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '여정 저장에 실패했습니다.',
      );
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setError('');
    closeCreateForm();
  };

  return (
    <Dialog open={isCreateFormOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="p-8">
        <DialogHeader>
          <DialogTitle>새 여정 만들기</DialogTitle>
          <DialogDescription>
            여정 정보를 입력하고 장소를 추가해보세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4">
          <label className="block mb-6">
            <span className="text-sm font-bold text-zinc-700 mb-2 block">여정명</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 주말 서울 나들이"
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] text-zinc-900 disabled:opacity-50"
              autoFocus
            />
          </label>

          <div className="mb-6">
            <span className="text-sm font-bold text-zinc-700 mb-2 block">
              기본 이동 수단
            </span>
            <div className="grid grid-cols-3 gap-3">
              {TRANSPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setTransportType(opt.value)}
                  className={`py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all disabled:opacity-50 cursor-pointer ${
                    transportType === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block mb-8">
            <span className="text-sm font-bold text-zinc-700 mb-2 block">여정 날짜</span>
            <input
              type="date"
              value={journeyDate}
              onChange={(e) => setJourneyDate(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[15px] text-zinc-900 disabled:opacity-50"
            />
          </label>

          {error && (
            <p className="text-sm text-red-500 mb-4" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-bold text-[15px] hover:bg-zinc-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white font-bold text-[15px] hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? '저장 중...' : '여정 시작하기'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
