import React, { useEffect, useState } from 'react';
import { Marker } from 'react-naver-maps';

export default function AnimatedMarker({ delay = 0, iconContent, iconAnchor, ...props }: any) {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    // delay + 500ms(animation duration + buffer) 후에는 애니메이션 클래스 제거
    // 컴포넌트 리렌더링 시 마커가 계속 떨어지는 현상 방지
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, delay + 500); 

    return () => clearTimeout(timer);
  }, [delay]);

  const animationStyle = isAnimating ? `
    animation: markerDropAnim 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
    animation-delay: ${delay}ms;
  ` : '';

  // 네이버 지도 커스텀 HTML 마커의 최상단 div에 애니메이션 스타일 주입
  const animatedIconContent = iconContent.replace(
    '<div style="', 
    `<div style="${animationStyle}`
  );

  return (
    <Marker 
      {...props} 
      icon={{
        content: animatedIconContent,
        anchor: iconAnchor
      }}
    />
  );
}
