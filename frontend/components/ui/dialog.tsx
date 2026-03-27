"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  children,
  contentClassName,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-heading/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className={cn(
          "max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl border border-gray-100",
          "animate-in zoom-in-95 slide-in-from-bottom-5 duration-300",
          contentClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
