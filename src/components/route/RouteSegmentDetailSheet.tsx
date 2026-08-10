'use client';

import React from 'react';
import { DirectionStep } from '@/types/journey';
import { Bus, Train, Footprints, X, Bell, MapPin, Navigation, Clock } from 'lucide-react';
import { formatDurationMinutes } from '@/lib/utils/journeyUtils';

interface RouteSegmentDetailSheetProps {
  step: DirectionStep | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectStation?: (station: { stationName: string; lat?: number; lng?: number }) => void;
}

export const RouteSegmentDetailSheet: React.FC<RouteSegmentDetailSheetProps> = ({
  step,
  isOpen,
  onClose,
  onSelectStation,
}) => {
  if (!isOpen || !step) return null;

  const stationList = step.passStopList?.stationList || [];
  const badgeColor = step.color || (step.type === 'walk' ? '#6B7280' : '#3B82F6');

  const getTransportIcon = () => {
    switch (step.type) {
      case 'bus':
      case 'expressbus':
        return <Bus className="w-5 h-5 text-white" />;
      case 'subway':
      case 'train':
        return <Train className="w-5 h-5 text-white" />;
      case 'car':
      case 'taxi':
        return <Navigation className="w-5 h-5 text-white" />;
      case 'walk':
      default:
        return <Footprints className="w-5 h-5 text-slate-700" />;
    }
  };

  const handleStationClick = (st: any) => {
    // Extract lat/lng safely from st.lat, st.lng, st.y, st.x (ODsay returns x for lng, y for lat)
    const lat = st.lat !== undefined ? Number(st.lat) : (st.y !== undefined ? parseFloat(String(st.y)) : undefined);
    const lng = st.lng !== undefined ? Number(st.lng) : (st.x !== undefined ? parseFloat(String(st.x)) : undefined);

    if (onSelectStation) {
      onSelectStation({
        stationName: st.stationName,
        lat,
        lng,
      });
    }
    // Close Sheet so user can clearly see map pan/zoom and focus marker
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[3000] flex justify-center items-end pointer-events-auto select-none">
      {/* Semi-transparent Overlay Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Sliding Bottom Sheet Container */}
      <div className="relative w-full max-w-[480px] max-h-[82vh] bg-white rounded-t-3xl shadow-2xl flex flex-col z-10 overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Top Handle bar */}
        <div className="w-full py-2.5 flex justify-center items-center cursor-grab active:cursor-grabbing bg-slate-50 border-b border-slate-100">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header Title Section */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ backgroundColor: badgeColor }}
            >
              {getTransportIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {step.type === 'walk' ? '도보' : step.name || '이동 구간'}
                </span>
                <span className="text-xs font-bold text-blue-600">
                  {formatDurationMinutes(step.duration)} 소요
                </span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 truncate mt-0.5">
                {step.startName ? `${step.startName} → ${step.endName || ''}` : step.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub Info Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>총 {stationList.length > 0 ? stationList.length : 1}개 정류장/지점</span>
          </div>
          {step.headsign && (
            <span className="text-slate-500 font-medium">방면: {step.headsign}</span>
          )}
        </div>

        {/* Stations Scroll List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {stationList.length > 0 ? (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-200">
              {stationList.map((st: any, idx: number) => {
                const isFirst = idx === 0;
                const isLast = idx === stationList.length - 1;

                return (
                  <div
                    key={idx}
                    onClick={() => handleStationClick(st)}
                    className={`
                      relative group flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer
                      ${
                        isFirst || isLast
                          ? 'bg-blue-50/60 border-blue-200 text-slate-900 shadow-xs'
                          : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-blue-50/20 text-slate-800'
                      }
                    `}
                  >
                    {/* Timeline Node Dot */}
                    <div
                      className={`
                        absolute -left-6 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition-transform group-hover:scale-125
                        ${
                          isFirst
                            ? 'border-emerald-500'
                            : isLast
                            ? 'border-rose-500'
                            : 'border-blue-500'
                        }
                      `}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          isFirst
                            ? 'bg-emerald-500'
                            : isLast
                            ? 'bg-rose-500'
                            : 'bg-blue-500'
                        }`}
                      />
                    </div>

                    {/* Station Name & Index */}
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400">
                          #{idx + 1}
                        </span>
                        {isFirst && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700">
                            승차
                          </span>
                        )}
                        {isLast && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">
                            하차
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 truncate mt-0.5">
                        {st.stationName}
                      </div>
                    </div>

                    {/* Action Helper Pin Icon Button */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-bold">위치 보기</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-sm font-medium">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <span>이동 세부 가이드 구간입니다.</span>
            </div>
          )}
        </div>

        {/* Bottom Helper Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Bell className="w-4 h-4 text-blue-600" />
            <span>하차 1개 정류장 전 스마트 알림 연동 중</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default RouteSegmentDetailSheet;
