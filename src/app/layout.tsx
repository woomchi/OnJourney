import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import QueryProvider from "@/providers/QueryProvider";
import "./globals.css";

import PWAProvider from "@/components/PWAProvider";
import OfflineBanner from "@/components/ui/OfflineBanner";
import PolyfillProvider from "@/components/PolyfillProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "On-Journey",
  description: "당신의 모든 이동이 온전히, 여정이 되도록.",
  icons: {
    icon: "/service_logo2.png",
  },
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
            <PWAProvider>
              <PolyfillProvider>
                <OfflineBanner />
                {children}
              </PolyfillProvider>
            </PWAProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
