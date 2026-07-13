import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { DialogProvider } from "@/providers/DialogProvider";
import QueryProvider from "@/providers/QueryProvider";
import "./globals.css";

import PWAProvider from "@/components/PWAProvider";
import OfflineBanner from "@/components/ui/OfflineBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "On-Journey",
  description: "당신의 모든 이동이 온전히, 여정이 되도록.",
  icons: {
    icon: "/service_logo2.png",
    apple: "/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <AuthProvider>
            <DialogProvider>
              <PWAProvider>
                <OfflineBanner />
                {children}
              </PWAProvider>
            </DialogProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
