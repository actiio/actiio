import StaticPageLayout from "@/components/static-page-layout";

export default function PrivacyPage() {
  return (
    <StaticPageLayout 
      title="Privacy Policy" 
      subtitle="Last updated: April 2026"
    >
      <div className="space-y-8">
        <p className="font-bold text-red-500 bg-red-50 p-4 rounded-xl">
          [PLACEHOLDER: Please paste your Privacy Policy content here.]
        </p>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">1. Data Collection</h2>
          <p>
            We collect the minimum amount of data required to provide our service. This includes 
            your email address, basic business profile, and metadata related to your sales leads.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">2. Gmail Data Usage</h2>
          <p>
            When you connect your Gmail account, we access your emails to identify leads and 
            generate follow-up drafts. <strong>We do not store the bodies of your emails</strong> in our 
            database. We fetch them live through the Gmail API only when needed for processing.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">3. Data Sharing</h2>
          <p>
            We do not sell your personal data. We share data only with service providers 
            necessary for service delivery (e.g., Groq for AI processing, Cashfree for payments).
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">4. Compliance</h2>
          <p>
            We comply with applicable data protection laws, including the Indian Digital 
            Personal Data Protection (DPDP) Act. You have the right to request deletion 
            of your data at any time.
          </p>
        </section>
      </div>
    </StaticPageLayout>
  );
}
