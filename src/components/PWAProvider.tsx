"use client";

import { createContext, useContext, useEffect, useState } from 'react';

interface PWAContextType {
  isSupported: boolean;
  isInstalled: boolean;
}

const PWAContext = createContext<PWAContextType>({
  isSupported: false,
  isInstalled: false,
});

export const usePWA = () => useContext(PWAContext);

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Check if Service Worker is supported
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'development') {
        // In development, actively unregister any existing service workers and clear caches to prevent HMR freeze
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister().then((success) => {
              if (success) {
                console.log('Unregistered service worker for development mode.');
              }
            });
          }
        });

        if ('caches' in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              caches.delete(key);
            }
          });
        }
      } else {
        setTimeout(() => setIsSupported(true), 0);

        // Register the service worker in production
        navigator.serviceWorker
          .register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          })
          .then((registration) => {
            console.log('Service Worker registered successfully with scope:', registration.scope);
            
            // Handle service worker updates
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                      console.log('New service worker version is available. Please reload.');
                    } else {
                      console.log('Content is cached for offline use.');
                    }
                  }
                };
              }
            };
          })
          .catch((error) => {
            console.error('Service Worker registration failed:', error);
          });
      }
    }

    // 2. Check if the app is running in standalone mode (installed as PWA) or if testing via ?pwa=true
    if (typeof window !== 'undefined') {
      const checkPWA = () => {
        const isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches ||
          (navigator as any).standalone === true ||
          document.referrer.includes('android-app://') ||
          window.location.search.includes('pwa=true');
        setIsInstalled(isStandalone);
      };

      checkPWA();

      const mediaQuery = window.matchMedia('(display-mode: standalone)');
      const handleChange = () => checkPWA();
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      }
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleChange);
        }
      };
    }
  }, []);

  return (
    <PWAContext.Provider value={{ isSupported, isInstalled }}>
      {children}
    </PWAContext.Provider>
  );
}
