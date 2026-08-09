"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

interface MapContextType {
  map: naver.maps.Map | null;
  setMapInstance: (map: naver.maps.Map | null) => void;
}

const MapContext = createContext<MapContextType>({
  map: null,
  setMapInstance: () => {},
});

export function MapProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<naver.maps.Map | null>(null);

  const setMapInstance = useCallback((mapInstance: naver.maps.Map | null) => {
    setMap((prev) => (prev === mapInstance ? prev : mapInstance));
  }, []);

  return (
    <MapContext.Provider value={{ map, setMapInstance }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapInstance() {
  return useContext(MapContext);
}
