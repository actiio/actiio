"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("actiio-cookie-consent");
    if (!consent) {
      // Small delay to make it feel smoother
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("actiio-cookie-consent", "accepted");
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem("actiio-cookie-consent", "declined");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 z-[100] flex justify-center pointer-events-none">
      <div className={cn(
        "pointer-events-auto flex max-w-[600px] flex-col gap-4 rounded-3xl border border-white/20 bg-black/80 p-6 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-700 sm:flex-row sm:items-center sm:gap-6",
      )}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/20 text-brand-primary">
          <Cookie className="h-6 w-6" />
        </div>
        
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-white">Privacy & Cookies</h4>
          <p className="text-xs leading-relaxed text-gray-300">
            We use cookies to ensure you stay securely signed in and to improve your experience. 
            By continuing to use Actiio, you agree to our use of cookies.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <Button 
            onClick={handleAccept}
            className="rounded-full bg-brand-primary px-6 py-2 text-xs font-bold text-white hover:bg-brand-primary/90"
          >
            Accept
          </Button>
          <button 
            onClick={handleDecline}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
