import { useState } from "react";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <li key={card.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-blue-100/80">
                {SOURCE_LABELS[card.source]}
              </span>
              <time dateTime={card.createdAt} className="text-xs text-blue-100/50">
                {formatDate(card.createdAt)}
              </time>
            </div>

            {row.mode === "editing" ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-100/60">Front</label>
                  <textarea
                    value={row.draftFront}
                    maxLength={FIELD_MAX}
                    disabled={row.saving}
                    onChange={(e) => {
                      patchRow(card.id, { draftFront: e.target.value });
                    }}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:border-purple-400/60 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-100/60">Back</label>
                  <textarea
                    value={row.draftBack}
                    maxLength={FIELD_MAX}
                    disabled={row.saving}
                    onChange={(e) => {
                      patchRow(card.id, { draftBack: e.target.value });
                    }}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:border-purple-400/60 disabled:opacity-50"
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="font-semibold whitespace-pre-wrap text-white">{card.front}</p>
                <p className="mt-2 text-sm whitespace-pre-wrap text-blue-100/70">{card.back}</p>
              </>
            )}

            {row.error && <p className="mt-2 text-sm text-red-300">{row.error}</p>}

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
                    className="bg-purple-600 text-white hover:bg-purple-500"
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
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                </>
              ) : row.mode === "confirmingDelete" ? (
                <>
                  <span className="mr-1 self-center text-sm text-blue-100/70">Delete this card?</span>
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
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
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
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
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
                    className="border-white/20 bg-transparent text-red-300 hover:bg-red-500/10"
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
