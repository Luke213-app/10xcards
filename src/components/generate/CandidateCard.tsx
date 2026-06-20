import { Check, X, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";

export interface Candidate {
  id: string;
  /** Current (possibly edited) values. */
  front: string;
  back: string;
  /** Original AI-generated values — used to derive ai-full vs ai-edited. */
  originalFront: string;
  originalBack: string;
  saving: boolean;
  error: string | null;
}

const FIELD_MAX = 1000;

interface Props {
  candidate: Candidate;
  onChange: (id: string, field: "front" | "back", value: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function CandidateCard({ candidate, onChange, onAccept, onReject }: Props) {
  const edited = candidate.front !== candidate.originalFront || candidate.back !== candidate.originalBack;
  const disabled = candidate.saving;
  const invalid = !candidate.front.trim() || !candidate.back.trim();

  return (
    <li className="zen-shadow bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="border-foreground bg-accent text-accent-foreground inline-flex items-center gap-1.5 border-2 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.1em] uppercase">
          {edited && <Pencil className="size-3" />}
          {edited ? "edited" : "AI-generated"}
        </span>
      </div>

      <label className="text-muted-foreground mb-1 block text-[11px] font-medium tracking-[0.1em] uppercase">
        Front
      </label>
      <Textarea
        value={candidate.front}
        maxLength={FIELD_MAX}
        disabled={disabled}
        onChange={(e) => {
          onChange(candidate.id, "front", e.target.value);
        }}
        className="mb-3 text-sm"
        rows={2}
      />

      <label className="text-muted-foreground mb-1 block text-[11px] font-medium tracking-[0.1em] uppercase">
        Back
      </label>
      <Textarea
        value={candidate.back}
        maxLength={FIELD_MAX}
        disabled={disabled}
        onChange={(e) => {
          onChange(candidate.id, "back", e.target.value);
        }}
        className="text-sm"
        rows={3}
      />

      {candidate.error && <p className="text-destructive mt-2 text-sm">{candidate.error}</p>}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || invalid}
          onClick={() => {
            onAccept(candidate.id);
          }}
        >
          {candidate.saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            onReject(candidate.id);
          }}
        >
          <X className="size-4" />
          Reject
        </Button>
      </div>
    </li>
  );
}
