"use client";

import { useState } from "react";

import { createCheckoutSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  "Gmail + WhatsApp monitoring",
  "AI-generated follow-up drafts",
  "3 draft options per quiet lead",
  "Tone and context awareness",
  "Unlimited leads",
];

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  async function onCheckout() {
    setLoading(true);
    try {
      await createCheckoutSession();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-6 text-3xl font-semibold text-slate-900">Pricing</h1>
      <Card>
        <CardHeader>
          <CardTitle>$29/month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm text-slate-700">
            {features.map((feature) => (
              <li key={feature}>- {feature}</li>
            ))}
          </ul>
          <Button onClick={onCheckout} disabled={loading}>
            {loading ? "Redirecting..." : "Get Started"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
