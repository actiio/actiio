"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  message: string;
  type?: "success" | "error" | "default";
};

type ToastContextValue = {
  pushToast: (message: string, type?: "success" | "error" | "default") => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const value = useMemo(
    () => ({
      pushToast: (message: string, type: "success" | "error" | "default" = "success") => {
        nextIdRef.current += 1;
        const id = `toast-${Date.now()}-${nextIdRef.current}`;
        setItems((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
          setItems((prev) => prev.filter((item) => item.id !== id));
        }, 4000);
      },
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 pointer-events-none">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto min-w-[320px] rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-2xl transition-all duration-500",
              "animate-in slide-in-from-right-10 fade-in",
              item.type === "error" ? "bg-red-500" : "bg-brand-primary"
            )}
          >
            <div className="flex items-center gap-3">
              {item.type !== "error" ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {item.message}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return ctx;
}
