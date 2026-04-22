"use client";

import StaticPageLayout from "@/components/static-page-layout";
import { useState } from "react";

export default function TermsPage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <StaticPageLayout
      title="Terms of Service"
      subtitle="Effective Date: May 1, 2026 · Last Updated: April 2026"
    >
      <div className="space-y-6">
        {/* Download link */}
        <div className="flex items-center justify-end">
          <a
            href="/terms-of-service.pdf"
            download="Actiio_Terms_of_Service.pdf"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-2 text-sm font-bold text-brand-primary transition-all hover:bg-brand-primary/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PDF
          </a>
        </div>

        {/* PDF Embed */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-sm">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50 z-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
              <p className="text-sm font-medium text-brand-body/50">Loading document…</p>
            </div>
          )}
          <iframe
            src="/terms-of-service.pdf"
            className="w-full"
            style={{ height: "80vh", minHeight: "600px" }}
            title="Actiio Terms of Service"
            onLoad={() => setLoaded(true)}
          />
        </div>

        {/* Fallback for mobile */}
        <p className="text-center text-xs text-brand-body/40">
          If the document doesn&apos;t display,{" "}
          <a
            href="/terms-of-service.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-brand-primary hover:underline"
          >
            open it directly
          </a>
          .
        </p>
      </div>
    </StaticPageLayout>
  );
}
