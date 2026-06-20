import { useRef, useState, type ReactNode } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";

// Single source of truth for hand-authoring a flashcard. Rendered both by the
// dedicated /cards/new page (S-02) and by the generate flow's empty-state
// fallback (S-01), so the manual write path stays homogeneous with accept-save:
// it POSTs { front, back, source: "manual" } to the one /api/flashcards endpoint.

const FIELD_MAX = 1000;

interface Props {
  /** Section title. */
  heading: string;
  /** Sub-text under the title. */
  intro: string;
  /** Optional secondary action rendered inline next to "Save card" (e.g. the
   *  generate flow's "Start over"). */
  actions?: ReactNode;
  /** Optional content rendered below the form (e.g. a session hint). */
  footer?: ReactNode;
  /** Called after a card is successfully saved (e.g. so a modal can refresh). */
  onSaved?: () => void;
}

async function saveManualCard(front: string, back: string): Promise<void> {
  const res = await fetch("/api/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front, back, source: "manual" }),
  });
  if (!res.ok) {
    throw new Error("Save failed");
  }
}

export default function ManualCardForm({ heading, intro, actions, footer, onSaved }: Props) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const canSave = front.trim().length > 0 && back.trim().length > 0 && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveManualCard(front.trim(), back.trim());
      setFront("");
      setBack("");
      setSavedCount((n) => n + 1);
      onSaved?.();
      // Refocus Front so several cards can be added in a row without clicking.
      frontRef.current?.focus();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="zen-shadow bg-card p-6">
      <h2 className="text-foreground font-sans text-lg font-extrabold">{heading}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{intro}</p>

      <div className="mt-4 space-y-3">
        <Textarea
          ref={frontRef}
          value={front}
          maxLength={FIELD_MAX}
          onChange={(e) => {
            setFront(e.target.value);
          }}
          rows={2}
          placeholder="Front (question)"
          className="text-sm"
        />
        <Textarea
          value={back}
          maxLength={FIELD_MAX}
          onChange={(e) => {
            setBack(e.target.value);
          }}
          rows={3}
          placeholder="Back (answer)"
          className="text-sm"
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        {savedCount > 0 && <p className="text-primary text-sm">{savedCount} card(s) saved.</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={!canSave} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Save card
          </Button>
          {actions}
        </div>
        {footer}
      </div>
    </section>
  );
}
