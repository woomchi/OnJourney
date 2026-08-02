import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Polyline } from 'react-naver-maps';

export default function AnimatedPolyline({ path, delay = 0, duration = 800, skipAnimation = false, resetKey, onComplete, ...props }: any) {
  const [currentPath, setCurrentPath] = useState<any[]>(() => path || []);
  const polylineRef = useRef<any>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    hasAnimatedRef.current = false;
  }, [resetKey]);

  // Optimized pathKey generation to avoid heavy string concatenation on long paths
  const pathKey = useMemo(() => {
    if (!path || path.length === 0) return '';
    const len = path.length;
    const first = path[0];
    const last = path[len - 1];
    const fLat = typeof first.lat === 'function' ? first.lat() : first.lat;
    const fLng = typeof first.lng === 'function' ? first.lng() : first.lng;
    const lLat = typeof last.lat === 'function' ? last.lat() : last.lat;
    const lLng = typeof last.lng === 'function' ? last.lng() : last.lng;
    return `${len}:${fLat},${fLng}:${lLat},${lLng}`;
  }, [path]);

  const updatePolylinePath = (newPath: any[]) => {
    if (polylineRef.current) {
      if (typeof polylineRef.current.setPath === 'function') {
        polylineRef.current.setPath(newPath);
        return true;
      }
      if (polylineRef.current.instance && typeof polylineRef.current.instance.setPath === 'function') {
        polylineRef.current.instance.setPath(newPath);
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    if (!path || path.length < 2) {
      const initial = path || [];
      setCurrentPath(initial);
      updatePolylinePath(initial);
      return;
    }

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    const fullPath = navermaps
      ? path.map((pt: any) => {
          const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
          const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
          return pt instanceof navermaps.LatLng ? pt : new navermaps.LatLng(lat, lng);
        })
      : [...path];

    if (skipAnimation || hasAnimatedRef.current) {
      setCurrentPath(fullPath);
      updatePolylinePath(fullPath);
      if (onComplete) onComplete();
      return;
    }

    hasAnimatedRef.current = true;

    let timeoutId: NodeJS.Timeout;

    // Reset animation path imperative and update React state for initial position
    const startPath = [fullPath[0]];
    setCurrentPath(startPath);
    updatePolylinePath(startPath);
    startTimeRef.current = null;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    // Calculate total distance and cumulative distances for constant speed interpolation
    const distances = [0];
    let totalDist = 0;
    for (let i = 1; i < fullPath.length; i++) {
      const p1 = fullPath[i - 1];
      const p2 = fullPath[i];
      const lat1 = typeof p1.lat === 'function' ? p1.lat() : p1.lat;
      const lng1 = typeof p1.lng === 'function' ? p1.lng() : p1.lng;
      const lat2 = typeof p2.lat === 'function' ? p2.lat() : p2.lat;
      const lng2 = typeof p2.lng === 'function' ? p2.lng() : p2.lng;
      
      const d = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
      totalDist += d;
      distances.push(totalDist);
    }

    if (totalDist === 0) {
      setCurrentPath(fullPath);
      updatePolylinePath(fullPath);
      if (onComplete) onComplete();
      return;
    }

    const animate = (time: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = time;
      }
      
      const elapsed = time - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      if (progress >= 1) {
        setCurrentPath(fullPath);
        updatePolylinePath(fullPath);
        if (onComplete) onComplete();
        return;
      }

      const targetDist = progress * totalDist;
      
      let segIndex = 0;
      for (let i = 0; i < distances.length - 1; i++) {
        if (targetDist >= distances[i] && targetDist <= distances[i + 1]) {
          segIndex = i;
          break;
        }
      }

      const newPath = fullPath.slice(0, segIndex + 1);
      
      const distInSeg = targetDist - distances[segIndex];
      const segLength = distances[segIndex + 1] - distances[segIndex];
      const remainder = segLength === 0 ? 0 : distInSeg / segLength;
      
      const p1 = fullPath[segIndex];
      const p2 = fullPath[segIndex + 1];
      
      const lat1 = typeof p1.lat === 'function' ? p1.lat() : p1.lat;
      const lng1 = typeof p1.lng === 'function' ? p1.lng() : p1.lng;
      const lat2 = typeof p2.lat === 'function' ? p2.lat() : p2.lat;
      const lng2 = typeof p2.lng === 'function' ? p2.lng() : p2.lng;

      const currentLat = lat1 + (lat2 - lat1) * remainder;
      const currentLng = lng1 + (lng2 - lng1) * remainder;
      
      if (navermaps) {
         newPath.push(new navermaps.LatLng(currentLat, currentLng));
      } else {
         newPath.push({ lat: currentLat, lng: currentLng });
      }
      
      // Update SDK directly during rAF without triggering React state re-renders
      updatePolylinePath(newPath);
      requestRef.current = requestAnimationFrame(animate);
    };

    timeoutId = setTimeout(() => {
       requestRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  if (!path || path.length === 0) return null;

  return <Polyline ref={polylineRef} path={currentPath} {...props} />;
}
