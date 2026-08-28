"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Container as MapDiv, NaverMap, Marker, Polyline, useNavermaps } from 'react-naver-maps';
import type { Journey, Place, SelectedRoute } from '@/types/journey';
import { formatJourneyDate } from '@/lib/utils/journeyUtils';
import { useAuth } from '@/providers/AuthProvider';
import { useDialog } from '@/providers/DialogProvider';
import { insertJourney } from '@/lib/journeys/index';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  MapPin,
  Clock,
  Car,
  Bus,
  Footprints,
  Copy,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Share2,
  Check,
} from 'lucide-react';

interface ShareJourneyViewProps {
  journey: Journey;
}

function calculateSummary(places: Place[]) {
  let totalDuration = 0;
  let totalFare = 0;
  let totalDistance = 0;

  for (const place of places) {
    if (place.selected_route) {
      totalDuration += place.selected_route.duration || 0;
      totalFare += place.selected_route.fare || 0;
      totalDistance += place.selected_route.distance || 0;
    }
  }

  return { totalDuration, totalFare, totalDistance: Math.round(totalDistance * 10) / 10 };
}

export default function ShareJourneyView({ journey }: ShareJourneyViewProps) {
  const router = useRouter();
  const navermaps = useNavermaps();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { user, openAuthModal } = useAuth();
  const { alert, confirm } = useDialog();
  const queryClient = useQueryClient();

  const [isCopying, setIsCopying] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const mapRef = useRef<any>(null);

  const places = journey.places ?? [];
  const summary = useMemo(() => calculateSummary(places), [places]);

  // 지도 영역 바운드 계산
  useEffect(() => {
    if (!mapRef.current || !navermaps || places.length === 0) return;

    if (places.length === 1) {
      mapRef.current.setCenter(new navermaps.LatLng(places[0].lat, places[0].lng));
      mapRef.current.setZoom(15);
      return;
    }

    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(places[0].lat, places[0].lng),
      new navermaps.LatLng(places[0].lat, places[0].lng)
    );

    places.forEach((p) => {
      bounds.extend(new navermaps.LatLng(p.lat, p.lng));
      if (p.selected_route?.pathPoints) {
        p.selected_route.pathPoints.forEach((pt) => {
          bounds.extend(new navermaps.LatLng(pt.lat, pt.lng));
        });
      }
    });

    mapRef.current.fitBounds(bounds, {
      top: 60,
      bottom: isMobile ? 300 : 60,
      left: isMobile ? 40 : 420,
      right: 40,
    });
  }, [places, navermaps, isMobile]);

  // 장소 클릭 시 지도 이동
  const handlePlaceClick = (place: Place) => {
    setSelectedPlaceId(place.id);
    if (mapRef.current && navermaps) {
      mapRef.current.panTo(new navermaps.LatLng(place.lat, place.lng), { duration: 300 });
    }
  };

  // 링크 복사
  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // 내 여정으로 복사하기
  const handleImportToMyJourneys = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    const confirmed = await confirm({
      title: '내 여정으로 복사',
      message: `"${journey.title}" 여정을 내 계정으로 복사하시겠습니까?`,
      confirmLabel: '복사하기',
    });

    if (!confirmed) return;

    setIsCopying(true);
    try {
      const newJourney = await insertJourney({
        title: `${journey.title} (복사본)`,
        transport_type: journey.transport_type,
        journey_date: journey.journey_date,
      });

      if (journey.places && journey.places.length > 0) {
        await updateJourneyPlaces(newJourney.id, journey.places);
      }

      queryClient.invalidateQueries({ queryKey: ['journeys'] });

      await alert({
        title: '복사 완료',
        message: '내 여정 목록에 추가되었습니다. 홈 화면으로 이동합니다.',
        icon: 'success',
      });

      router.push(`/?j=${newJourney.id}`);
    } catch (err) {
      console.error('여정 복사 실패:', err);
      await alert({
        title: '오류',
        message: '여정을 복사하는 중 문제가 발생했습니다.',
        icon: 'warning',
      });
    } finally {
      setIsCopying(false);
    }
  };

  const getTransportIcon = () => {
    if (journey.transport_type === 'car') return <Car className="w-4 h-4 text-emerald-600" />;
    if (journey.transport_type === 'walk') return <Footprints className="w-4 h-4 text-amber-600" />;
    return <Bus className="w-4 h-4 text-blue-600" />;
  };

  return (
    <div className="flex h-[100dvh] w-full bg-white text-zinc-900 overflow-hidden font-sans relative">
      {/* ─── 좌측 (모바일: 하단 시트) 여정 상세 패널 ─── */}
      <aside className="w-full md:w-[380px] lg:w-[440px] h-[45vh] md:h-full flex flex-col bg-white border-t md:border-t-0 md:border-r border-zinc-100 shadow-xl md:shadow-none z-20 absolute md:relative bottom-0 left-0">
        {/* 헤더 */}
        <header className="px-6 py-5 border-b border-zinc-100/80 bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-100/80">
                <Share2 className="w-3 h-3" />
                <span>공유된 여정</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                {getTransportIcon()}
                <span>{journey.transport_type === 'public' ? '대중교통' : journey.transport_type === 'car' ? '차량' : '도보'}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="text-xs text-zinc-500 hover:text-zinc-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 font-bold">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>공유 링크 복사</span>
                </>
              )}
            </button>
          </div>

          <h1 className="text-xl font-black text-zinc-900 tracking-tight truncate">
            {journey.title}
          </h1>
          <p className="text-xs text-zinc-400 font-medium mt-1">
            {formatJourneyDate(journey.journey_date)} · 장소 {places.length}개
          </p>

          {/* 요약 바 */}
          {places.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-center">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 block">총 소요시간</span>
                <span className="text-xs font-black text-zinc-800">
                  {summary.totalDuration >= 60
                    ? `${Math.floor(summary.totalDuration / 60)}시간 ${summary.totalDuration % 60}분`
                    : `${summary.totalDuration}분`}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-zinc-400 block">총 이동거리</span>
                <span className="text-xs font-black text-zinc-800">{summary.totalDistance}km</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-zinc-400 block">예상 요금</span>
                <span className="text-xs font-black text-zinc-800">
                  {summary.totalFare > 0 ? `${summary.totalFare.toLocaleString()}원` : '무료'}
                </span>
              </div>
            </div>
          )}
        </header>

        {/* 경유지 타임라인 리스트 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 select-none">
          {places.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm font-medium">
              등록된 경유지가 없습니다.
            </div>
          ) : (
            places.map((place, idx) => {
              const isSelected = selectedPlaceId === place.id;
              const isFirst = idx === 0;
              const isLast = idx === places.length - 1;
              const route = place.selected_route;

              return (
                <div key={place.id} className="relative">
                  {/* 장소 카드 */}
                  <div
                    onClick={() => handlePlaceClick(place)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 shadow-sm'
                        : 'border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          isFirst
                            ? 'bg-emerald-500 text-white'
                            : isLast
                            ? 'bg-rose-500 text-white'
                            : 'bg-zinc-900 text-white'
                        }`}
                      >
                        {idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 truncate">
                            {place.place_name}
                          </h3>
                          {isFirst && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-600 rounded">
                              출발
                            </span>
                          )}
                          {isLast && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-rose-50 text-rose-600 rounded">
                              도착
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{place.address}</p>
                      </div>
                    </div>
                  </div>

                  {/* 구간 이동 안내 */}
                  {!isLast && (
                    <div className="my-2.5 ml-7 pl-4 border-l-2 border-dashed border-zinc-200 py-1">
                      {route ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-600 font-medium">
                          <span className="font-bold text-blue-600">{route.duration}분</span>
                          <span>·</span>
                          <span className="text-zinc-500">{route.name || '경로 안내'}</span>
                          {route.fare > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-500">{route.fare.toLocaleString()}원</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-300 font-medium">다음 장소로 이동</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 하단 액션 버튼 */}
        <footer className="p-4 border-t border-zinc-100 bg-white flex-shrink-0 flex gap-2.5">
          <button
            type="button"
            onClick={handleImportToMyJourneys}
            disabled={isCopying}
            className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isCopying ? '복사 중...' : '내 여정으로 가져오기'}</span>
          </button>

          <Link
            href="/"
            className="px-4 py-3.5 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] font-bold text-xs transition-all flex items-center gap-1"
          >
            <span>홈으로</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </footer>
      </aside>

      {/* ─── 우측 지도 영역 ─── */}
      <main className="flex-1 h-[55vh] md:h-full w-full relative bg-zinc-100">
        <MapDiv className="w-full h-full">
          <NaverMap
            ref={mapRef}
            defaultCenter={
              places.length > 0
                ? new navermaps.LatLng(places[0].lat, places[0].lng)
                : new navermaps.LatLng(37.5665, 126.978)
            }
            defaultZoom={13}
          >
            {/* 경유지 마커 */}
            {places.map((place, idx) => (
              <Marker
                key={place.id}
                position={new navermaps.LatLng(place.lat, place.lng)}
                title={place.place_name}
                onClick={() => handlePlaceClick(place)}
              />
            ))}

            {/* 구간별 경로 폴리라인 */}
            {places.map((place) => {
              if (!place.selected_route?.pathPoints || place.selected_route.pathPoints.length < 2) {
                return null;
              }
              const path = place.selected_route.pathPoints.map(
                (pt) => new navermaps.LatLng(pt.lat, pt.lng)
              );
              return (
                <Polyline
                  key={`route-${place.id}`}
                  path={path}
                  strokeColor="#3B82F6"
                  strokeWeight={5}
                  strokeOpacity={0.8}
                />
              );
            })}
          </NaverMap>
        </MapDiv>
      </main>
    </div>
  );
}
