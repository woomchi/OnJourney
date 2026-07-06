"use client";

import { useEffect } from 'react';
import { polyfill } from 'mobile-drag-drop';
// optional import of default css
import 'mobile-drag-drop/default.css';

export default function PolyfillProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize the polyfill
    // The force=true option can be used to force polyfill on desktop for testing, 
    // but by default it only applies to touch devices.
    polyfill({
      dragImageCenterOnTouch: true,
      holdToDrag: 300,
    });

    // We must add a CSS rule to prevent scrolling on the draggable items
    // This is required for iOS Safari to allow drag events instead of scroll events.
    window.addEventListener('touchmove', function() {}, { passive: false });
  }, []);

  return <>{children}</>;
}
