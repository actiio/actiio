"use client";

import * as React from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-heading/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" 
      onClick={onClose}
    >
      <div
        className={cn(
          "max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl border border-gray-100",
          "animate-in zoom-in-95 slide-in-from-bottom-5 duration-300 relative z-[101]",
          contentClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
