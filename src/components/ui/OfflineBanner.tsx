"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 초기 로드시 상태 확인
    if (typeof window !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center w-full animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
      <div className="mx-auto mt-4 px-4 py-2 bg-rose-500/95 backdrop-blur-md text-white shadow-lg rounded-full flex items-center gap-2 border border-rose-600/50 pointer-events-auto">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-100" />
        <span className="text-xs font-semibold tracking-wide shadow-sm">
          오프라인 상태입니다. 실시간 API 연동 및 여정 수정이 제한됩니다.
        </span>
      </div>
    </div>
  );
}
