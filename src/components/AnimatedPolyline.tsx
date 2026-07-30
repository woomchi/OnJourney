import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Polyline } from 'react-naver-maps';

export default function AnimatedPolyline({ path, delay = 0, duration = 800, skipAnimation = false, resetKey, onComplete, ...props }: any) {
  const [currentPath, setCurrentPath] = useState<any[]>([]);
  const polylineRef = useRef<any>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    hasAnimatedRef.current = false;
  }, [resetKey]);

  // stringified path to prevent animation restarts when only reference changes
  const pathKey = useMemo(() => {
    if (!path) return '';
    return path.map((p: any) => {
      const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
      const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
      return `${lat},${lng}`;
    }).join('|');
  }, [path]);

  const updatePolylinePath = (newPath: any[]) => {
    if (polylineRef.current) {
      if (typeof polylineRef.current.setPath === 'function') {
        polylineRef.current.setPath(newPath);
        return;
      }
      if (polylineRef.current.instance && typeof polylineRef.current.instance.setPath === 'function') {
        polylineRef.current.instance.setPath(newPath);
        return;
      }
    }
    // Fallback: update React state if ref is not available
    setCurrentPath(newPath);
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

    // Reset animation
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
      
      // Simple Euclidean distance for visual interpolation
      const d = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
      totalDist += d;
      distances.push(totalDist);
    }

    // If total distance is 0, just show it
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
      const progress = Math.min(elapsed / duration, 1); // 0 to 1
      
      if (progress >= 1) {
        setCurrentPath(fullPath);
        updatePolylinePath(fullPath);
        if (onComplete) onComplete();
        return;
      }

      const targetDist = progress * totalDist;
      
      // Find the segment where targetDist falls
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
      
      updatePolylinePath(newPath);
      requestRef.current = requestAnimationFrame(animate);
    };

    // Delay start for sequential animations
    timeoutId = setTimeout(() => {
       requestRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  if (!currentPath || currentPath.length === 0) return null;

  return <Polyline ref={polylineRef} path={currentPath} {...props} />;
}
