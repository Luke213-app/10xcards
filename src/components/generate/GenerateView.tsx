import { useState } from "react";
import { Sparkles, Loader2, AlertCircle, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function GenerateView() {
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
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <label htmlFor="source" className="mb-2 block text-sm font-medium text-blue-100/80">
            Source text
          </label>
          <textarea
            id="source"
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
            }}
            disabled={status === "generating"}
            rows={10}
            placeholder="Paste up to 10,000 characters of notes…"
            className="w-full resize-y rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-purple-400/60 disabled:opacity-50"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className={cn("text-xs", overCap ? "text-red-300" : nearCap ? "text-amber-300" : "text-blue-100/50")}>
              {sourceText.length.toLocaleString()} / {MAX_SOURCE.toLocaleString()}
              {overCap && " — over the limit"}
            </span>
            <Button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
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
            <div className="mt-4">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-purple-400" />
              </div>
              <p className="mt-2 text-xs text-blue-100/60">Working on your cards — this can take a few seconds…</p>
            </div>
          )}
        </section>
      )}

      {/* Review */}
      {status === "review" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-blue-100/70">
              {candidates.length > 0
                ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} to review`
                : "All candidates handled"}
              {savedCount > 0 && <span className="ml-2 text-green-300">· {savedCount} saved</span>}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <RotateCcw className="size-4" />
              Start over
            </Button>
          </div>

          {candidates.length > 0 ? (
            <ul className="space-y-4">
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
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <Check className="mx-auto mb-2 size-8 text-green-300" />
              <p className="text-blue-100/80">You&apos;re all done. {savedCount} card(s) saved to your collection.</p>
            </div>
          )}
        </section>
      )}

      {/* Empty — no usable candidates, offer manual create */}
      {status === "empty" && <EmptyState onReset={reset} savedCount={savedCount} />}

      {/* Error */}
      {status === "error" && (
        <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 size-8 text-red-300" />
          <p className="text-blue-100/90">Something went wrong while generating. Your text is still here.</p>
          <Button type="button" onClick={handleGenerate} className="mt-4 bg-purple-600 text-white hover:bg-purple-500">
            <RotateCcw className="size-4" />
            Retry
          </Button>
        </section>
      )}
    </div>
  );
}

function EmptyState({ onReset, savedCount }: { onReset: () => void; savedCount: number }) {
  return (
    <ManualCardForm
      heading="No usable cards from this text"
      intro="The AI couldn't extract flashcards. You can still add one by hand below."
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          <RotateCcw className="size-4" />
          Start over
        </Button>
      }
      footer={
        savedCount > 0 ? (
          <p className="text-xs text-blue-100/50">{savedCount} card(s) saved earlier this session.</p>
        ) : null
      }
    />
  );
}
