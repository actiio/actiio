import StaticPageLayout from "@/components/static-page-layout";

export default function AboutPage() {
  return (
    <StaticPageLayout 
      title="About Actiio" 
      subtitle="Scale revenue, not headcount."
    >
      <section className="space-y-8">
        <p>
          Actiio is an intelligent multi-agent platform designed for modern sales teams. 
          We build specialized AI agents that handle the repetitive, high-volume tasks 
          of the sales cycle, allowing your team to focus on building relationships and closing deals.
        </p>

        <h2 className="text-2xl font-black text-brand-heading pt-4">Our First Agent: Gmail Follow-up</h2>
        <p>
          Our flagship agent monitors your Gmail inbox automatically, identifies active sales 
          conversations, and generates personalized follow-up drafts for leads that have gone quiet. 
          We believe that every warm lead deserves a response, but we also know that manual 
          follow-up is often the first thing to slip when a team gets busy.
        </p>

        <h2 className="text-2xl font-black text-brand-heading pt-4">The Human-in-the-Loop Philosophy</h2>
        <p>
          Unlike other AI tools that send emails autonomously, Actiio follows a strict 
          human-approval model. Our agents generate drafts, but they never click "Send" without 
          your explicit review. This ensures that every communication maintain's your brand's 
          authentic voice and accuracy.
        </p>

        <h2 className="text-2xl font-black text-brand-heading pt-4">The Synthetic Squad</h2>
        <p>
          Actiio is expanding. Beyond follow-ups, we are developing agents for lead scoring, 
          cold outreach, proposal generation, and more. Our goal is to build the "Synthetic Squad" 
          that works alongside your human sales team, making them 10x more effective.
        </p>
      </section>
    </StaticPageLayout>
  );
}
