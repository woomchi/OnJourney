import MapArea from '@/components/MapArea';
import JourneySidebar from '@/components/JourneySidebar';

export default function Home() {
  return (
    <div className="flex h-screen w-full bg-white text-zinc-900 overflow-hidden font-sans">
      <JourneySidebar />

      <main className="flex-1 h-full relative bg-zinc-50 flex items-center justify-center">
        <MapArea />
      </main>
    </div>
  );
}
