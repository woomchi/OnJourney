import { Metadata } from 'next';
import { fetchPublicJourneyById } from '@/lib/journeys/index';
import ShareJourneyView from './ShareJourneyView';
import Link from 'next/link';
import { MapPin, ArrowRight, ShieldAlert } from 'lucide-react';

interface Props {
  params: Promise<{
    journeyId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { journeyId } = await params;
  const journey = await fetchPublicJourneyById(journeyId);

  if (!journey) {
    return {
      title: '여정을 찾을 수 없습니다 - OnJourney',
      description: '존재하지 않거나 비공개 설정된 여정입니다.',
    };
  }

  const placeCount = journey.places?.length ?? 0;
  const description = `${journey.journey_date} · ${placeCount}개의 장소를 경유하는 ${
    journey.transport_type === 'public' ? '대중교통' : journey.transport_type === 'car' ? '차량' : '도보'
  } 추천 여정입니다.`;

  return {
    title: `${journey.title} | OnJourney 여정 공유`,
    description,
    openGraph: {
      title: `${journey.title} | OnJourney 여정 공유`,
      description,
      type: 'website',
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { journeyId } = await params;
  const journey = await fetchPublicJourneyById(journeyId);

  if (!journey) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-zinc-50 p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-5 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 tracking-tight mb-2">
          공개되지 않은 여정입니다
        </h1>
        <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-6">
          해당 여정이 삭제되었거나 작성자가 비공개로 설정하여 접근할 수 없습니다.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-zinc-950 hover:bg-zinc-900 text-white text-sm font-bold shadow-md transition-all active:scale-[0.98]"
        >
          <span>OnJourney 홈으로 가기</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return <ShareJourneyView journey={journey} />;
}
