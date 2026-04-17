import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { CookieConsent } from "@/components/ui/cookie-consent";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Actiio | Scale Intelligence",
  description: "Automated Gmail follow-ups for warm leads. Stay on top of every conversation with AI-powered draft generation.",
  metadataBase: new URL("https://actiio.ai"),
  openGraph: {
    title: "Actiio",
    description: "Never lose a warm lead again.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-white text-brand-body antialiased`}>
        <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" strategy="beforeInteractive" />
        <ToastProvider>
          {children}
          <CookieConsent />
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
