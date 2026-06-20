import { useState } from "react";
import { Eye, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Grade, ReviewCard } from "@/types";

// One-card-at-a-time review loop (S-05): show front → reveal back → grade →
// advance, with each grade button labelled with its next-due interval (FR-010).
// SSR-seeded from src/pages/review/index.astro and mirrors the per-action
// saving/error pattern from CardList/GenerateView. No client-side ts-fsrs — the
// previews are computed server-side and arrive on each ReviewCard.

// Grade scale (FR-011): Again(1)/Hard(2)/Good(3)/Easy(4) → ts-fsrs Rating. Each
// keeps a distinct colour so the four outcomes are visually separable.
const GRADES: { rating: Grade; label: string; className: string }[] = [
  { rating: 1, label: "Again", className: "bg-red-600/80 text-white hover:bg-red-500" },
  { rating: 2, label: "Hard", className: "bg-amber-600/80 text-white hover:bg-amber-500" },
  { rating: 3, label: "Good", className: "bg-green-600/80 text-white hover:bg-green-500" },
  { rating: 4, label: "Easy", className: "bg-blue-600/80 text-white hover:bg-blue-500" },
];

async function gradeCard(id: string, rating: Grade): Promise<void> {
  const res = await fetch(`/api/flashcards/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) {
    throw new Error("Grade failed");
  }
}

export default function ReviewSession({ cards }: { cards: ReviewCard[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = cards.length;
  const card = cards[index];

  async function handleGrade(rating: Grade) {
    // `card` is always defined here: grade buttons only render while index < total
    // (the completion branch returns first).
    if (grading) return;
    setGrading(true);
    setError(null);
    try {
      await gradeCard(card.id, rating);
      // Advance to the next card and re-hide the answer. The graded card's new
      // schedule is persisted server-side; it won't reappear until next due.
      setGrading(false);
      setRevealed(false);
      setIndex((i) => i + 1);
    } catch {
      // Stay on this card so the user can retry the same grade (mirrors
      // CardList's per-item error).
      setGrading(false);
      setError("Couldn't save your grade. Try again.");
    }
  }

  // Queue exhausted — completion summary.
  if (index >= total) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-green-300" />
        <h2 className="text-lg font-semibold text-white">Session complete — {total} reviewed</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-blue-100/60">Nice work. Your cards have been rescheduled.</p>
        <a
          href="/cards"
          className="mt-6 inline-block rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
        >
          Back to my cards
        </a>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-blue-100/70">
        Card {index + 1} of {total}
      </p>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="mb-1 text-xs font-medium text-blue-100/60">Front</p>
        <p className="font-semibold whitespace-pre-wrap text-white">{card.front}</p>

        {revealed && (
          <>
            <hr className="my-4 border-white/10" />
            <p className="mb-1 text-xs font-medium text-blue-100/60">Back</p>
            <p className="text-sm whitespace-pre-wrap text-blue-100/70">{card.back}</p>
          </>
        )}
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {!revealed ? (
        <Button
          type="button"
          onClick={() => {
            setRevealed(true);
          }}
          className="bg-purple-600 text-white hover:bg-purple-500"
        >
          <Eye className="size-4" />
          Show answer
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GRADES.map((g) => (
            <Button
              key={g.rating}
              type="button"
              disabled={grading}
              onClick={() => {
                void handleGrade(g.rating);
              }}
              className={cn(g.className, "disabled:opacity-60")}
            >
              {grading ? <Loader2 className="size-4 animate-spin" /> : null}
              {g.label} · {card.previews[g.rating].label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
