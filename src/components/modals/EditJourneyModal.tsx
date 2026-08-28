"use client";

import { useState, useEffect, type FormEvent } from 'react';
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

import { Share2, Copy, Check, Globe, Lock } from 'lucide-react';

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
  const { updateJourneyInfo, isLoading } = useJourneyStore();

  const [title, setTitle] = useState('');
  const [transportType, setTransportType] = useState<TransportType>('public');
  const [journeyDate, setJourneyDate] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen && journey) {
      setTitle(journey.title);
      setTransportType(journey.transport_type);
      setJourneyDate(journey.journey_date);
      setIsPublic(journey.is_public ?? false);
      setCopied(false);
      setError('');
    }
  }

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/share/${journey.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
    }
  };

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
      await updateJourneyInfo(title, journeyDate, transportType, isPublic);
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

          {/* ─ 여정 공개 & 공유 링크 섹션 ─ */}
          <div className="mb-8 p-4.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPublic ? 'bg-blue-500/10 text-blue-600' : 'bg-zinc-200 text-zinc-500'}`}>
                  {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900">여정 공개 및 공유</h4>
                  <p className="text-[12px] text-zinc-400 font-medium">
                    {isPublic ? '링크를 가진 누구나 이 여정을 조회할 수 있습니다' : '현재 비공개 상태입니다 (본인만 열람)'}
                  </p>
                </div>
              </div>

              {/* 토글 스위치 */}
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                disabled={isLoading}
                onClick={() => setIsPublic(!isPublic)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isPublic ? 'bg-blue-600' : 'bg-zinc-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isPublic ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 공개 상태일 때 공유 링크 및 복사 버튼 표시 */}
            {isPublic && (
              <div className="mt-3.5 pt-3.5 border-t border-zinc-200/60 flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-white rounded-xl border border-zinc-200 text-[12px] text-zinc-500 font-mono truncate select-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/share/${journey.id}` : `/share/${journey.id}`}
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                    copied
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>링크 복사</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

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
