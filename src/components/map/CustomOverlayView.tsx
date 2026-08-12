"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-naver-maps';

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
  const contextMap = useMap();
  const targetMap = mapProp || contextMap;
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const overlayRef = useRef<naver.maps.OverlayView | null>(null);

  useEffect(() => {
    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps || !targetMap) return;

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.willChange = 'transform';
    el.style.zIndex = String(zIndex);
    el.style.pointerEvents = 'auto';

    const handleNativeClick = (e: Event) => {
      e.stopPropagation();
    };
    el.addEventListener('click', handleNativeClick);
    setContainer(el);

    class ReactOverlayView extends navermaps.OverlayView {
      private element: HTMLDivElement;
      private pos: { lat: number; lng: number };
      private ancX: number;
      private ancY: number;
      private offX: number;
      private offY: number;
      private observer: MutationObserver | null = null;
      private rafId: number | null = null;

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

        this.observer = new MutationObserver(() => {
          if (this.element.offsetWidth > 0 || this.element.offsetHeight > 0) {
            this.draw();
          }
        });
        this.observer.observe(this.element, { childList: true, subtree: true, attributes: true });
      }

      draw() {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }

        const projection = this.getProjection();
        if (!projection) return;

        const mapsObj = window.naver?.maps;
        if (!mapsObj) return;

        const latLng = new mapsObj.LatLng(this.pos.lat, this.pos.lng);
        const pixelPosition = projection.fromCoordToOffset(latLng);

        const width = this.element.offsetWidth || 0;
        const height = this.element.offsetHeight || 0;

        if ((width === 0 || height === 0) && this.element.children.length > 0) {
          this.rafId = requestAnimationFrame(() => this.draw());
          return;
        }

        const left = pixelPosition.x - width * this.ancX + this.offX;
        const top = pixelPosition.y - height * this.ancY + this.offY;

        this.element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      }

      onRemove() {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
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
    overlay.setMap(targetMap);

    return () => {
      el.removeEventListener('click', handleNativeClick);
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMap]);

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
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {children}
    </div>,
    container
  );
}
