"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { suggestSkill } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Sparkles, Loader2, X } from "lucide-react";

interface SuggestSkillModalProps {
  children: React.ReactNode;
}

export function SuggestSkillModal({ children }: SuggestSkillModalProps) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skill, setSkill] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skill.trim()) return;

    setLoading(true);
    try {
      await suggestSkill(skill, description);
      pushToast("Thanks! We've received your suggestion.", "success");
      setOpen(false);
      setSkill("");
      setDescription("");
    } catch (error: any) {
      pushToast(error.message || "Failed to send suggestion.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {children}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} contentClassName="max-w-lg">
        <div className="relative overflow-hidden bg-white p-0">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 via-transparent to-brand-primary/10 pointer-events-none" />
          
          <button 
            onClick={() => setOpen(false)}
            className="absolute right-6 top-6 z-10 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative p-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <Sparkles className="h-6 w-6" />
            </div>

            <div className="mb-8 space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-brand-heading">
                Suggest a New Skill
              </h2>
              <p className="text-base text-brand-body/60">
                What should our agents learn next? We build what our users need most.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="skill" className="text-sm font-semibold text-brand-heading">
                  Skill Name
                </label>
                <Input
                  id="skill"
                  placeholder="e.g. LinkedIn Outreach, Cold Calling"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  required
                  className="h-12 rounded-xl border-gray-100 bg-gray-50/50 px-4 focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-semibold text-brand-heading">
                  How would this help you?
                </label>
                <Textarea
                  id="description"
                  placeholder="Tell us a bit about how this skill would improve your workflow..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[120px] rounded-xl border-gray-100 bg-gray-50/50 p-4 focus:ring-2 focus:ring-brand-primary/20"
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={loading || !skill.trim()}
                  className="h-12 w-full rounded-xl bg-brand-primary text-sm font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Submit Suggestion"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Dialog>
    </>
  );
}
