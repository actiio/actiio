import Link from "next/link";
import Image from "next/image";

export default function StaticPageLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#fcfcfc] text-brand-heading selection:bg-brand-primary/20">
      <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative h-8 w-8 overflow-hidden rounded-xl bg-brand-primary p-1.5 transition-transform group-hover:rotate-12">
              <Image src="/logo.png" alt="Actiio Logo" width={32} height={32} className="h-full w-full object-contain brightness-0 invert" />
            </div>
            <span className="text-xl font-black tracking-tight text-brand-heading sm:text-2xl">
              Actiio
            </span>
          </Link>
          <Link href="/sign-up">
            <button className="text-sm font-bold text-brand-primary hover:underline">
              Get Started
            </button>
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-32 sm:pt-40">
        <header className="mb-12 space-y-4 text-center sm:mb-20">
          <h1 className="text-4xl font-black tracking-tight text-brand-heading sm:text-6xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-lg font-medium text-brand-body/60 sm:text-xl">
              {subtitle}
            </p>
          )}
        </header>

        <div className="prose prose-brand max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:text-brand-body/80 prose-p:leading-relaxed prose-li:text-brand-body/80">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-100 bg-white py-12 text-center">
        <p className="text-xs font-bold text-brand-body/40">
          © {new Date().getFullYear()} Actiio AI. Made for the builders.
        </p>
        <div className="mt-4 flex justify-center gap-6 text-[10px] font-black uppercase tracking-widest text-brand-body/40">
          <Link href="/privacy" className="hover:text-brand-heading transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-brand-heading transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
