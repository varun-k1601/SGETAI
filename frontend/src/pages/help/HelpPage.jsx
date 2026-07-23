import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

export function HelpPage() {
  const { session } = useAuth();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const feedbackMutation = useMutation({
    mutationFn: (text) =>
      apiRequest("/feedback", {
        method: "POST",
        token: session.accessToken,
        body: { message: text, type: "user_feedback" },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Feedback sent successfully!" });
      setFeedbackText("");
      setTimeout(() => setFeedback({ type: "", message: "" }), 3000);
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "Failed to send feedback" });
    },
  });

  const handleFeedbackSubmit = () => {
    if (feedbackText.trim()) {
      feedbackMutation.mutate(feedbackText);
    }
  };

  const faqs = [
    {
      question: "How does match scoring work?",
      answer: "We score your profile against the JD across skills, seniority, and tooling. Anything above 80% is considered strong.",
    },
    {
      question: "Can I hide my profile from recruiters?",
      answer: "Yes — toggle Stealth mode in Settings → Privacy.",
    },
    {
      question: "How is Pro different from Normal?",
      answer: "Pro adds always-on AI: auto-apply, auto-connect, auto-DM with smart safety guardrails.",
    },
  ];

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Support
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Help &amp; feedback
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Browse the docs or talk to the team.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Support Options */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Docs & Guides */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <path d="M12 7v14"></path>
            <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>
          </svg>
          <p className="mt-2 font-semibold">Docs &amp; guides</p>
          <p className="text-xs text-muted-foreground">Walkthroughs for every feature.</p>
        </div>

        {/* Community */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
          </svg>
          <p className="mt-2 font-semibold">Community</p>
          <p className="text-xs text-muted-foreground">Tips from 12k+ job seekers.</p>
        </div>

        {/* Contact Support */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m4.93 4.93 4.24 4.24"></path>
            <path d="m14.83 9.17 4.24-4.24"></path>
            <path d="m14.83 14.83 4.24 4.24"></path>
            <path d="m9.17 14.83-4.24 4.24"></path>
            <circle cx="12" cy="12" r="4"></circle>
          </svg>
          <p className="mt-2 font-semibold">Contact support</p>
          <p className="text-xs text-muted-foreground">Avg reply under 4 hours.</p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* FAQs Section */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant col-span-12 lg:col-span-7">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                FAQ
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Most asked</h2>
            </div>
          </div>

          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <details key={index} className="group rounded-xl border border-border/40 bg-surface/40 p-3">
                <summary className="cursor-pointer text-sm font-semibold">{faq.question}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Feedback Section */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant col-span-12 lg:col-span-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Feedback
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Tell us what's missing</h2>
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleFeedbackSubmit();
            }}
          >
            <textarea
              rows="5"
              placeholder="What could be better?"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-surface/70 p-3 text-sm outline-none focus:bg-surface transition"
            />
            <button
              type="submit"
              disabled={feedbackMutation.isPending || !feedbackText.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide h-4 w-4"
                aria-hidden="true"
              >
                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
                <path d="m21.854 2.147-10.94 10.939"></path>
              </svg>
              Send feedback
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
