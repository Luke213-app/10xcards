import { useState } from "react";
import { Eye, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Grade, ReviewCard } from "@/types";

// One-card-at-a-time review loop (S-05): show front → reveal back → grade →
// advance, with each grade button labelled with its next-due interval (FR-010).
// SSR-seeded from src/pages/review/index.astro and mirrors the per-action
// saving/error pattern from CardList/GenerateView. No client-side ts-fsrs — the
// previews are computed server-side and arrive on each ReviewCard.

// Grade scale (FR-011): Again(1)/Hard(2)/Good(3)/Easy(4) → ts-fsrs Rating.
// zen-faithful: the recommended "Good" grade is the filled-accent button, the
// rest are ink-bordered. The four are distinguished by label + position +
// the next-due interval hint, not by semantic colour.
const GRADES: { rating: Grade; label: string; variant: "default" | "outline" }[] = [
  { rating: 1, label: "Again", variant: "outline" },
  { rating: 2, label: "Hard", variant: "outline" },
  { rating: 3, label: "Good", variant: "default" },
  { rating: 4, label: "Easy", variant: "outline" },
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
      <section className="zen-shadow bg-card p-8 text-center">
        <CheckCircle2 className="text-primary mx-auto mb-3 size-10" />
        <h2 className="text-foreground font-sans text-lg font-extrabold">Session complete — {total} reviewed</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
          Nice work. Your cards have been rescheduled.
        </p>
        <Button asChild className="mt-6">
          <a href="/cards">Back to my cards</a>
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Card {index + 1} of {total}
      </p>

      <section className="zen-shadow bg-card p-6">
        <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-[0.1em] uppercase">Front</p>
        <p className="text-foreground font-semibold whitespace-pre-wrap">{card.front}</p>

        {revealed && (
          <>
            <hr className="border-foreground/15 my-4 border-t-2" />
            <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-[0.1em] uppercase">Back</p>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{card.back}</p>
          </>
        )}
      </section>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!revealed ? (
        <Button
          type="button"
          onClick={() => {
            setRevealed(true);
          }}
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
              variant={g.variant}
              disabled={grading}
              onClick={() => {
                void handleGrade(g.rating);
              }}
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
