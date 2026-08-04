"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CustomOverlayViewProps {
  position: { lat: number; lng: number };
  zIndex?: number;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  map?: naver.maps.Map | null;
  anchorX?: number; // 0~1 (0.5 means center)
  anchorY?: number; // 0~1 (1 means bottom)
  offsetX?: number; // pixel offset X
  offsetY?: number; // pixel offset Y
}

export function CustomOverlayView({
  position,
  zIndex = 100,
  onClick,
  children,
  map: mapProp,
  anchorX = 0.5,
  anchorY = 1,
  offsetX = 0,
  offsetY = 0,
}: CustomOverlayViewProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const overlayRef = useRef<naver.maps.OverlayView | null>(null);

  useEffect(() => {
    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // Create container element for React portal
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.zIndex = String(zIndex);
    el.style.pointerEvents = 'auto';
    // 크기가 측정되어 위치가 계산될 때까지 순간적인 튀는 현상을 막기 위해 초기에는 숨김 처리
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.15s ease-out';
    setContainer(el);

    class ReactOverlayView extends navermaps.OverlayView {
      private element: HTMLDivElement;
      private pos: { lat: number; lng: number };
      private ancX: number;
      private ancY: number;
      private offX: number;
      private offY: number;
      private resizeObserver: ResizeObserver | null = null;
      private hasPositioned = false;

      constructor(
        element: HTMLDivElement,
        pos: { lat: number; lng: number },
        ancX: number,
        ancY: number,
        offX: number,
        offY: number
      ) {
        super();
        this.element = element;
        this.pos = pos;
        this.ancX = ancX;
        this.ancY = ancY;
        this.offX = offX;
        this.offY = offY;
      }

      onAdd() {
        const overlayLayer = this.getPanes().overlayLayer;
        overlayLayer.appendChild(this.element);

        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => {
            this.draw();
          });
          this.resizeObserver.observe(this.element);
        }
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;

        const mapsObj = window.naver?.maps;
        if (!mapsObj) return;

        const latLng = new mapsObj.LatLng(this.pos.lat, this.pos.lng);
        const pixelPosition = projection.fromCoordToOffset(latLng);

        const width = this.element.offsetWidth || 0;
        const height = this.element.offsetHeight || 0;

        const left = pixelPosition.x - width * this.ancX + this.offX;
        const top = pixelPosition.y - height * this.ancY + this.offY;

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;

        // 요새 크기가 유효하거나 측정이 이루어졌을 때 화면에 노출
        if (width > 0 || height > 0 || this.hasPositioned) {
          this.hasPositioned = true;
          this.element.style.opacity = '1';
        } else {
          // 크기가 아직 0인 경우 다음 프레임에 한번 더 체크
          requestAnimationFrame(() => {
            if (this.element && !this.hasPositioned) {
              this.draw();
            }
          });
        }
      }

      onRemove() {
        if (this.resizeObserver) {
          this.resizeObserver.disconnect();
          this.resizeObserver = null;
        }
        if (this.element && this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
      }

      updatePosition(
        pos: { lat: number; lng: number },
        ancX: number,
        ancY: number,
        offX: number,
        offY: number
      ) {
        this.pos = pos;
        this.ancX = ancX;
        this.ancY = ancY;
        this.offX = offX;
        this.offY = offY;
        this.draw();
      }
    }

    const overlay = new ReactOverlayView(el, position, anchorX, anchorY, offsetX, offsetY);
    overlayRef.current = overlay;

    // Attach to map if provided, or search window map instance
    const targetMap = mapProp || (window as any).__naver_map_instance__;
    if (targetMap) {
      overlay.setMap(targetMap);
    } else {
      // Fallback: search DOM for map container or retry
      const checkTimer = setInterval(() => {
        const m = (window as any).__naver_map_instance__;
        if (m && overlayRef.current) {
          overlayRef.current.setMap(m);
          clearInterval(checkTimer);
        }
      }, 200);

      return () => {
        clearInterval(checkTimer);
        if (overlayRef.current) {
          overlayRef.current.setMap(null);
          overlayRef.current = null;
        }
      };
    }

    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapProp]);

  // Update position & options on prop changes
  useEffect(() => {
    if (overlayRef.current) {
      (overlayRef.current as any).updatePosition(position, anchorX, anchorY, offsetX, offsetY);
    }
  }, [position, anchorX, anchorY, offsetX, offsetY]);

  // Update zIndex on prop change
  useEffect(() => {
    if (container) {
      container.style.zIndex = String(zIndex);
    }
  }, [container, zIndex]);

  if (!container) return null;

  return createPortal(
    <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {children}
    </div>,
    container
  );
}
