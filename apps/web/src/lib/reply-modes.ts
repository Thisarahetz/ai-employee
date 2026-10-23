import type { ReplyMode } from "@/lib/types";

/** Short label for each reply mode (English; translated with t()). */
export const MODE_LABELS: Record<ReplyMode, string> = {
  AI: "AI writes every reply",
  HYBRID: "Saved answers first, AI for the rest",
  NO_AI: "No AI: saved answers, then staff",
};

export const MODE_DETAILS: Record<ReplyMode, { title: string; description: string }> = {
  HYBRID: {
    title: "Hybrid (recommended)",
    description:
      "Greetings and saved answers are sent instantly at no cost. AI answers only what they don't cover, and uses your saved answers as facts.",
  },
  NO_AI: {
    title: "No AI",
    description:
      "Never uses an AI provider. Saved answers reply instantly; anything else goes to your team and shows up as a question to answer.",
  },
  AI: {
    title: "AI only",
    description: "AI writes every reply, using your saved answers as facts. Most flexible, highest cost.",
  },
};
