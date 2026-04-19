import StaticPageLayout from "@/components/static-page-layout";

export default function RefundPolicyPage() {
  return (
    <StaticPageLayout 
      title="Refund Policy" 
      subtitle="Last updated: April 2026"
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">1. Digital Nature of Service</h2>
          <p>
            Actiio is a Software-as-a-Service (SaaS) platform that provides instant access to digital AI agents. 
            Due to the nature of digital services and the immediate costs associated with AI cloud processing, 
            our services are generally non-refundable.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">2. Subscription Cancellation</h2>
          <p>
            You may cancel your subscription at any time through the Billing section of your dashboard. 
            Upon cancellation, you will continue to have access to the service until the end of your 
            current billing cycle. No further charges will be made after cancellation.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">3. Refund Eligibility</h2>
          <p>
            We offer refunds only in the following exceptional circumstances:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Technical Failure:</strong> If a technical bug entirely prevents you from using the service for more than 48 hours and our support team is unable to resolve it.</li>
            <li><strong>Double Charging:</strong> If you have been accidentally charged twice for the same billing period.</li>
          </ul>
          <p className="mt-4 italic">
            Please note that "change of mind" or "under-utilization" of the service are not eligible grounds for a refund.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black text-brand-heading pt-4">4. Requesting a Refund</h2>
          <p>
            To request a refund, please email <strong>support@actiio.ai</strong> within 7 days of the transaction. 
            Your request will be reviewed by our team within 5-7 business days. If approved, the refund will 
            be processed to the original payment method.
          </p>
        </section>
      </div>
    </StaticPageLayout>
  );
}
