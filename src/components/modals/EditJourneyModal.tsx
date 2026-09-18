"use client";

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Journey, TransportType } from '@/types/journey';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useDialog } from '@/providers/DialogProvider';
import {
  isJourneyTitleDuplicate,
  generateUniqueJourneyTitle,
} from '@/lib/utils/journeyUtils';

const TRANSPORT_OPTIONS = [
  { value: 'public' as const, label: '대중교통', icon: '🚌' },
  { value: 'car' as const, label: '차량', icon: '🚗' },
  { value: 'walk' as const, label: '도보', icon: '🚶' },
];

interface EditJourneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  journey: Journey;
}

export default function EditJourneyModal({ isOpen, onClose, journey }: EditJourneyModalProps) {
  const queryClient = useQueryClient();
  const { confirm } = useDialog();
  const updateJourneyInfo = useJourneyStore((s) => s.updateJourneyInfo);
  const isLoading = useJourneyStore((s) => s.isLoading);
  const journeys = useJourneyStore((s) => s.journeys);

  const [title, setTitle] = useState('');
  const [transportType, setTransportType] = useState<TransportType>('public');
  const [journeyDate, setJourneyDate] = useState('');
  const [error, setError] = useState('');

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen && journey) {
      setTitle(journey.title);
      setTransportType(journey.transport_type);
      setJourneyDate(journey.journey_date);
      setError('');
    }
  }

  const isDuplicate = useMemo(
    () => isJourneyTitleDuplicate(title, journeys, journey?.id),
    [title, journeys, journey?.id]
  );

  const suggestedTitle = useMemo(
    () =>
      isDuplicate
        ? generateUniqueJourneyTitle(
            title,
            journeys.filter((j) => j.id !== journey?.id).map((j) => j.title)
          )
        : '',
    [isDuplicate, title, journeys, journey?.id]
  );

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

    if (isDuplicate) {
      const confirmed = await confirm({
        title: '동일한 여정명이 존재합니다',
        message: `'${title.trim()}' 여정이 이미 목록에 있습니다. 그래도 동일한 이름으로 저장하시겠습니까?`,
        confirmLabel: '그대로 저장',
        cancelLabel: '이름 수정',
        icon: 'warning',
      });
      if (!confirmed) {
        return;
      }
    }

    setError('');

    try {
      await updateJourneyInfo(title, journeyDate, transportType);
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '여정 수정에 실패했습니다.',
      );
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="p-8">
        <DialogHeader>
          <DialogTitle>여정 정보 수정</DialogTitle>
          <DialogDescription>
            여정명, 날짜, 기본 이동 수단을 수정할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 w-full min-w-0">
          <div className="mb-6">
            <label htmlFor="edit-journey-title" className="text-sm font-bold text-zinc-700 mb-2 block">
              여정명
            </label>
            <input
              id="edit-journey-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 주말 서울 나들이"
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 transition-all text-[15px] text-zinc-900 disabled:opacity-50 ${
                isDuplicate
                  ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20'
                  : 'border-zinc-200 focus:border-blue-500 focus:ring-blue-500/20'
              }`}
              autoFocus
            />
            {isDuplicate && (
              <div className="mt-2.5 p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-900">
                    동일한 이름의 여정이 이미 존재합니다.
                  </p>
                  {suggestedTitle && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="text-amber-800 text-[11px]">추천:</span>
                      <button
                        type="button"
                        onClick={() => setTitle(suggestedTitle)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-200/70 hover:bg-amber-200 text-amber-950 font-bold rounded-lg border border-amber-300 transition-colors cursor-pointer text-xs"
                      >
                        <span>{suggestedTitle}</span>
                        <span className="text-[10px] text-amber-800 font-normal">로 변경</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

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

          <label className="block mb-6">
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
              {isLoading ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
