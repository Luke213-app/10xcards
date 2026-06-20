import { useState } from "react";
import { Sparkles, Loader2, AlertCircle, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { CandidateCard, type Candidate } from "@/components/generate/CandidateCard";
import ManualCardForm from "@/components/manual/ManualCardForm";
import type { FlashcardCandidate, FlashcardSource, GenerateResponse } from "@/types";

const MAX_SOURCE = 10000;
const WARN_AT = 9000;

type Status = "idle" | "generating" | "review" | "empty" | "error";

async function saveFlashcard(front: string, back: string, source: FlashcardSource): Promise<void> {
  const res = await fetch("/api/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front, back, source }),
  });
  if (!res.ok) {
    throw new Error("Save failed");
  }
}

export default function GenerateView({ onSaved }: { onSaved?: () => void } = {}) {
  const [status, setStatus] = useState<Status>("idle");
  const [sourceText, setSourceText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  const overCap = sourceText.length > MAX_SOURCE;
  const nearCap = sourceText.length >= WARN_AT;
  const canGenerate = sourceText.trim().length > 0 && !overCap && status !== "generating";

  async function handleGenerate() {
    setStatus("generating");
    setSavedCount(0);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
      });
      if (!res.ok) {
        throw new Error("Generation failed");
      }
      const data = (await res.json()) as GenerateResponse;
      const next: Candidate[] = data.candidates.map((c: FlashcardCandidate, i) => ({
        id: `c-${i}`,
        front: c.front,
        back: c.back,
        originalFront: c.front,
        originalBack: c.back,
        saving: false,
        error: null,
      }));
      if (next.length === 0) {
        setStatus("empty");
      } else {
        setCandidates(next);
        setStatus("review");
      }
    } catch {
      setStatus("error");
    }
  }

  function updateCandidate(id: string, field: "front" | "back", value: string) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  async function acceptCandidate(id: string) {
    const card = candidates.find((c) => c.id === id);
    if (!card) return;
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, saving: true, error: null } : c)));
    const source: FlashcardSource =
      card.front !== card.originalFront || card.back !== card.originalBack ? "ai-edited" : "ai-full";
    try {
      await saveFlashcard(card.front.trim(), card.back.trim(), source);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      setSavedCount((n) => n + 1);
      onSaved?.();
    } catch {
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, saving: false, error: "Couldn't save. Try again." } : c)),
      );
    }
  }

  function rejectCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  function reset() {
    setStatus("idle");
    setCandidates([]);
    setSavedCount(0);
  }

  return (
    <div className="space-y-6">
      {/* Paste + generate — always visible except while reviewing/empty/error swaps it out */}
      {(status === "idle" || status === "generating") && (
        <section className="zen-shadow bg-card p-5">
          <label
            htmlFor="source"
            className="text-muted-foreground mb-2 block text-[11px] font-medium tracking-[0.1em] uppercase"
          >
            Source text
          </label>
          <Textarea
            id="source"
            data-testid="generate-source"
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
            }}
            disabled={status === "generating"}
            rows={10}
            placeholder="Paste up to 10,000 characters of notes…"
            className="text-sm"
          />
          <div className="mt-2 flex items-center justify-between">
            <span
              className={cn(
                "text-xs",
                overCap ? "text-destructive" : nearCap ? "text-primary" : "text-muted-foreground",
              )}
            >
              {sourceText.length.toLocaleString()} / {MAX_SOURCE.toLocaleString()}
              {overCap && " — over the limit"}
            </span>
            <Button type="button" data-testid="generate-submit" disabled={!canGenerate} onClick={handleGenerate}>
              {status === "generating" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate
                </>
              )}
            </Button>
          </div>
          {status === "generating" && (
            <div className="mt-4" data-testid="generate-loading">
              <div className="border-foreground bg-muted h-1.5 w-full overflow-hidden border-2">
                <div className="bg-primary h-full w-1/3 animate-pulse" />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">Working on your cards — this can take a few seconds…</p>
            </div>
          )}
        </section>
      )}

      {/* Review */}
      {status === "review" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {candidates.length > 0
                ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} to review`
                : "All candidates handled"}
              {savedCount > 0 && <span className="text-primary ml-2">· {savedCount} saved</span>}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="size-4" />
              Start over
            </Button>
          </div>

          {candidates.length > 0 ? (
            <ul className="space-y-4" data-testid="generate-results">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onChange={updateCandidate}
                  onAccept={acceptCandidate}
                  onReject={rejectCandidate}
                />
              ))}
            </ul>
          ) : (
            <div className="zen-shadow bg-card p-8 text-center">
              <Check className="text-primary mx-auto mb-2 size-8" />
              <p className="text-muted-foreground">
                You&apos;re all done. {savedCount} card(s) saved to your collection.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Empty — no usable candidates, offer manual create */}
      {status === "empty" && (
        <div data-testid="generate-empty">
          <EmptyState onReset={reset} savedCount={savedCount} onSaved={onSaved} />
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <section
          data-testid="generate-error"
          className="border-destructive bg-card border-2 p-8 text-center shadow-[3px_3px_0_var(--foreground)]"
        >
          <AlertCircle className="text-destructive mx-auto mb-3 size-8" />
          <p className="text-foreground">Something went wrong while generating. Your text is still here.</p>
          <Button type="button" data-testid="generate-retry" onClick={handleGenerate} className="mt-4">
            <RotateCcw className="size-4" />
            Retry
          </Button>
        </section>
      )}
    </div>
  );
}

function EmptyState({
  onReset,
  savedCount,
  onSaved,
}: {
  onReset: () => void;
  savedCount: number;
  onSaved?: () => void;
}) {
  return (
    <ManualCardForm
      heading="No usable cards from this text"
      intro="The AI couldn't extract flashcards. You can still add one by hand below."
      onSaved={onSaved}
      actions={
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcw className="size-4" />
          Start over
        </Button>
      }
      footer={
        savedCount > 0 ? (
          <p className="text-muted-foreground text-xs">{savedCount} card(s) saved earlier this session.</p>
        ) : null
      }
    />
  );
}
