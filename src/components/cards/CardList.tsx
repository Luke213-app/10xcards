import { useState } from "react";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";
import type { Flashcard, FlashcardSource, UpdateFlashcardCommand } from "@/types";

// Interactive owner of the user's saved collection. Seeded from SSR data
// (src/pages/cards/index.astro) and renders each card with edit-in-place and
// inline-confirm delete, mirroring the per-item saving/error pattern from
// GenerateView/CandidateCard. Calls the single-card routes from S-04 phase 1.

const FIELD_MAX = 1000;

// Human-readable label per origin (mirrors the FlashcardSource enum exactly).
const SOURCE_LABELS: Record<FlashcardSource, string> = {
  "ai-full": "AI",
  "ai-edited": "AI (edited)",
  manual: "Manual",
};

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

type Mode = "view" | "editing" | "confirmingDelete";

interface Row {
  card: Flashcard;
  mode: Mode;
  draftFront: string;
  draftBack: string;
  saving: boolean;
  error: string | null;
}

function toRow(card: Flashcard): Row {
  return { card, mode: "view", draftFront: card.front, draftBack: card.back, saving: false, error: null };
}

async function patchCard(id: string, patch: UpdateFlashcardCommand): Promise<Flashcard> {
  const res = await fetch(`/api/flashcards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error("Update failed");
  }
  const data = (await res.json()) as { flashcard: Flashcard };
  return data.flashcard;
}

async function deleteCard(id: string): Promise<void> {
  const res = await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error("Delete failed");
  }
}

export default function CardList({ cards }: { cards: Flashcard[] }) {
  const [rows, setRows] = useState<Row[]>(() => cards.map(toRow));

  function patchRow(id: string, next: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.card.id === id ? { ...r, ...next } : r)));
  }

  function startEdit(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.card.id === id ? { ...r, mode: "editing", draftFront: r.card.front, draftBack: r.card.back, error: null } : r,
      ),
    );
  }

  function cancelEdit(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.card.id === id ? { ...r, mode: "view", draftFront: r.card.front, draftBack: r.card.back, error: null } : r,
      ),
    );
  }

  async function save(id: string) {
    const row = rows.find((r) => r.card.id === id);
    if (!row) return;
    const front = row.draftFront.trim();
    const back = row.draftBack.trim();

    // Only send fields that actually changed; an unchanged edit is just a cancel
    // (the API rejects an empty patch with 400, so never send one).
    const patch: UpdateFlashcardCommand = {};
    if (front !== row.card.front) patch.front = front;
    if (back !== row.card.back) patch.back = back;
    if (patch.front === undefined && patch.back === undefined) {
      cancelEdit(id);
      return;
    }

    patchRow(id, { saving: true, error: null });
    try {
      const updated = await patchCard(id, patch);
      setRows((prev) =>
        prev.map((r) =>
          r.card.id === id
            ? {
                card: updated,
                mode: "view",
                draftFront: updated.front,
                draftBack: updated.back,
                saving: false,
                error: null,
              }
            : r,
        ),
      );
    } catch {
      patchRow(id, { saving: false, error: "Couldn't save. Try again." });
    }
  }

  function startDelete(id: string) {
    patchRow(id, { mode: "confirmingDelete", error: null });
  }

  function cancelDelete(id: string) {
    patchRow(id, { mode: "view", error: null });
  }

  async function confirmDelete(id: string) {
    patchRow(id, { saving: true, error: null });
    try {
      await deleteCard(id);
      setRows((prev) => prev.filter((r) => r.card.id !== id));
    } catch {
      patchRow(id, { saving: false, error: "Couldn't delete. Try again." });
    }
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const { card } = row;
        const invalid =
          row.draftFront.trim().length === 0 ||
          row.draftBack.trim().length === 0 ||
          row.draftFront.length > FIELD_MAX ||
          row.draftBack.length > FIELD_MAX;

        return (
          <li key={card.id} className="zen-shadow bg-card p-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="border-foreground bg-accent text-accent-foreground inline-block border-2 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.1em] uppercase">
                {SOURCE_LABELS[card.source]}
              </span>
              <time dateTime={card.createdAt} className="text-muted-foreground text-xs">
                {formatDate(card.createdAt)}
              </time>
            </div>

            {row.mode === "editing" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-muted-foreground mb-1 block text-[11px] font-medium tracking-[0.1em] uppercase">
                    Front
                  </label>
                  <Textarea
                    value={row.draftFront}
                    maxLength={FIELD_MAX}
                    disabled={row.saving}
                    onChange={(e) => {
                      patchRow(card.id, { draftFront: e.target.value });
                    }}
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-[11px] font-medium tracking-[0.1em] uppercase">
                    Back
                  </label>
                  <Textarea
                    value={row.draftBack}
                    maxLength={FIELD_MAX}
                    disabled={row.saving}
                    onChange={(e) => {
                      patchRow(card.id, { draftBack: e.target.value });
                    }}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-foreground font-semibold whitespace-pre-wrap">{card.front}</p>
                <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">{card.back}</p>
              </>
            )}

            {row.error && <p className="text-destructive mt-2 text-sm">{row.error}</p>}

            <div className="mt-3 flex gap-2">
              {row.mode === "editing" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={row.saving || invalid}
                    onClick={() => {
                      void save(card.id);
                    }}
                  >
                    {row.saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={row.saving}
                    onClick={() => {
                      cancelEdit(card.id);
                    }}
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                </>
              ) : row.mode === "confirmingDelete" ? (
                <>
                  <span className="text-muted-foreground mr-1 self-center text-sm">Delete this card?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={row.saving}
                    onClick={() => {
                      void confirmDelete(card.id);
                    }}
                  >
                    {row.saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={row.saving}
                    onClick={() => {
                      cancelDelete(card.id);
                    }}
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      startEdit(card.id);
                    }}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      startDelete(card.id);
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
