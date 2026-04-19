import StaticPageLayout from "@/components/static-page-layout";

export default function TermsPage() {
  return (
    <StaticPageLayout 
      title="Terms of Service" 
      subtitle="Last updated: April 2026"
    >
      <div className="space-y-8">
        <p className="font-bold text-red-500 bg-red-50 p-4 rounded-xl">
          [PLACEHOLDER: Please paste your Terms of Service content here.]
        </p>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">1. Acceptance of Terms</h2>
          <p>
            By accessing and using Actiio (the "Service"), you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">2. Description of Service</h2>
          <p>
            Actiio provides AI-powered sales tools and agents, including but not limited to the 
            Gmail Follow-up Agent. We reserve the right to modify or discontinue any part of the 
            Service at any time.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">3. User Obligations</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials 
            and for all activities that occur under your account. You agree to use the Service 
            only for lawful purposes and in accordance with all applicable laws (including 
            the Indian IT Act).
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">4. Limitation of Liability</h2>
          <p>
            Actiio provides AI-generated drafts. You are solely responsible for reviewing and 
            sending these drafts. We are not liable for any damages resulting from the 
            content of emails sent through our Service.
          </p>
        </section>
      </div>
    </StaticPageLayout>
  );
}
