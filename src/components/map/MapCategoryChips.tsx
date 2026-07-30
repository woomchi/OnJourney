"use client";

import { useJourneyStore } from '@/stores/journey-store';
import { Coffee, Utensils, Hotel, Compass, Store, Bus } from 'lucide-react';

interface CategoryItem {
  id: string;
  label: string;
  query: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accentColor: string;
  badgeBg: string;
}

const CATEGORIES: CategoryItem[] = [
  {
    id: 'cafe',
    label: '카페',
    query: '카페',
    icon: Coffee,
    accentColor: 'text-amber-600',
    badgeBg: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 border-amber-200/60',
  },
  {
    id: 'food',
    label: '맛집',
    query: '맛집',
    icon: Utensils,
    accentColor: 'text-rose-600',
    badgeBg: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 border-rose-200/60',
  },
  {
    id: 'hotel',
    label: '숙소',
    query: '숙소',
    icon: Hotel,
    accentColor: 'text-emerald-600',
    badgeBg: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border-emerald-200/60',
  },
  {
    id: 'attraction',
    label: '명소',
    query: '관광지',
    icon: Compass,
    accentColor: 'text-blue-600',
    badgeBg: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 border-blue-200/60',
  },
  {
    id: 'convenience',
    label: '편의점',
    query: '편의점',
    icon: Store,
    accentColor: 'text-purple-600',
    badgeBg: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 border-purple-200/60',
  },
  {
    id: 'transit',
    label: '교통',
    query: '역 정류장',
    icon: Bus,
    accentColor: 'text-cyan-600',
    badgeBg: 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 border-cyan-200/60',
  },
];

export default function MapCategoryChips() {
  const {
    isSearchMode,
    openSearchMode,
    searchQuery,
    setSearchQuery,
    triggerSearch,
  } = useJourneyStore();

  const handleCategoryClick = (query: string) => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (!isSearchMode) {
      openSearchMode();
    }
    setSearchQuery(query);
    setTimeout(() => {
      triggerSearch();
    }, 50);
  };

  return (
    <div className="relative flex items-center max-w-full pointer-events-auto select-none rounded-3xl bg-white/95 backdrop-blur-xl border border-zinc-200 shadow-[0_4px_20px_rgba(0,0,0,0.1)] overflow-hidden">
      <div
        className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1.5 px-3.5 w-full"
        style={{
          maskImage: 'linear-gradient(to right, transparent, white 16px, white calc(100% - 16px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, white 16px, white calc(100% - 16px), transparent)',
        }}
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = isSearchMode && searchQuery === cat.query;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.query)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 border ${isActive
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500/50 shadow-md shadow-blue-500/25 scale-[1.02]'
                : `bg-white/90 border-zinc-200/70 text-zinc-700 hover:border-zinc-300 ${cat.badgeBg}`
                }`}
            >
              <Icon
                className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-white drop-shadow-xs' : cat.accentColor
                  }`}
                strokeWidth={2.4}
              />
              <span className={isActive ? 'text-white' : 'text-zinc-800'}>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
