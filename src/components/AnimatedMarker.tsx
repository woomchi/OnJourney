import React from 'react';
import { Marker } from 'react-naver-maps';

export default function AnimatedMarker({ delay = 0, iconContent, iconAnchor, ...props }: any) {
  return (
    <Marker 
      {...props} 
      icon={{
        content: iconContent,
        anchor: iconAnchor
      }}
    />
  );
}

