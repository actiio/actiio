import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default function OnboardingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Onboarding</h1>
      <OnboardingFlow />
    </main>
  );
}
