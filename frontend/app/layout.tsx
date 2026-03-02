import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Actiio | Never lose a warm lead again",
  description: "Automated follow-ups for Gmail and WhatsApp leads. Stay on top of every conversation with AI-powered draft generation.",
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
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
