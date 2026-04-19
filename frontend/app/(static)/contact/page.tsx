import StaticPageLayout from "@/components/static-page-layout";
import { Mail, MapPin } from "lucide-react";

export default function ContactPage() {
  return (
    <StaticPageLayout 
      title="Contact Us" 
      subtitle="We're here to help you scale."
    >
      <div className="space-y-12">
        <section className="grid gap-8 sm:grid-cols-2">
          <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <Mail className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-black text-brand-heading">Email Support</h3>
            <p className="mt-2 text-sm text-brand-body/60">For technical issues or billing inquiries:</p>
            <p className="mt-4 font-bold text-brand-primary">support@actiio.ai</p>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <MapPin className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-black text-brand-heading">Office Address</h3>
            <p className="mt-2 text-sm text-brand-body/60">Registered Business Address:</p>
            <p className="mt-4 font-bold text-brand-body/80">Actiio AI, [Your Business Address Here]<br />India</p>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-gray-50 p-8 sm:p-12">
          <h2 className="text-2xl font-black text-brand-heading">Merchant Compliance</h2>
          <p className="text-sm leading-relaxed text-brand-body/60">
            For the purpose of payment processing via our partners (Cashfree), please note that 
            business inquiries and official notices should be directed to the email address above. 
            Typical response time for support tickets is under 24 hours.
          </p>
        </section>
      </div>
    </StaticPageLayout>
  );
}
