"use client";

import Link from "next/link";
import Image from "next/image";
import { AuthForm } from "@/components/auth-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen bg-white overflow-visible">
      {/* Left side - dark branding */}
      <div className="hidden min-h-screen w-1/2 flex-col justify-between bg-brand-heading p-16 text-white lg:flex overflow-visible relative">
        <Link href="/" className="group z-20 mb-auto flex items-center gap-2">
          <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto brightness-0 invert opacity-60 transition-opacity group-hover:opacity-100" />
          <span className="text-lg font-bold tracking-tight text-white/60 transition-colors group-hover:text-white">Actiio</span>
        </Link>

        <div className="flex flex-col items-center justify-center text-center space-y-12 py-20 overflow-visible relative z-10">
          <div className="group relative flex items-center justify-center overflow-visible">
            {/* Cinematic Radial Glow (Gradient-based) */}
            <div
              className="absolute h-[600px] w-[600px] transition-all duration-1000 opacity-100 group-hover:opacity-30"
              style={{
                pointerEvents: 'none',
                background: 'radial-gradient(circle, rgba(0, 191, 99, 0.25) 0%, transparent 65%)',
                transform: 'translate(-50%, -50%)',
                left: '50%',
                top: '50%'
              }}
            />

            <div className="relative z-10 transition-all duration-700 group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="Actiio Logo"
                width={200}
                height={200}
                className="h-48 w-auto transition-all duration-700"
                style={{
                  filter: "invert(48%) sepia(79%) saturate(2476%) hue-rotate(123deg) brightness(97%) contrast(101%) drop-shadow(0 0 20px rgba(0,191,99,0.3))"
                }}
              />
            </div>
          </div>

          <div className="max-w-xs space-y-6">
            <h2 className="text-5xl font-black tracking-tighter text-white leading-[0.9]">
              SALES DONE <br />
              <span className="text-brand-primary italic">RIGHT.</span>
            </h2>
            <p className="text-xl font-medium text-white/30 leading-relaxed uppercase tracking-widest text-[12px]">
              Intelligent Sales Infrastructure
            </p>
          </div>
        </div>

        <p className="mt-auto text-[10px] font-black tracking-[0.2em] uppercase text-white/20">
          © {new Date().getFullYear()} Actiio AI. All rights reserved.
        </p>
      </div>

      {/* Right side - white login form */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-1/2">
        <div className="mb-12 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
            <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
          </Link>
        </div>
        <AuthForm mode="sign-up" />
      </div>
    </main>
  );
}
