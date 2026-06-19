import { Check, X, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <li className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-blue-100/70">
          {edited && <Pencil className="size-3" />}
          {edited ? "edited" : "AI-generated"}
        </span>
      </div>

      <label className="mb-1 block text-xs font-medium text-blue-100/60">Front</label>
      <textarea
        value={candidate.front}
        maxLength={FIELD_MAX}
        disabled={disabled}
        onChange={(e) => {
          onChange(candidate.id, "front", e.target.value);
        }}
        className="mb-3 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:border-purple-400/60 disabled:opacity-50"
        rows={2}
      />

      <label className="mb-1 block text-xs font-medium text-blue-100/60">Back</label>
      <textarea
        value={candidate.back}
        maxLength={FIELD_MAX}
        disabled={disabled}
        onChange={(e) => {
          onChange(candidate.id, "back", e.target.value);
        }}
        className="w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:border-purple-400/60 disabled:opacity-50"
        rows={3}
      />

      {candidate.error && <p className="mt-2 text-sm text-red-300">{candidate.error}</p>}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || invalid}
          onClick={() => {
            onAccept(candidate.id);
          }}
          className={cn("bg-purple-600 text-white hover:bg-purple-500")}
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
          className="border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          <X className="size-4" />
          Reject
        </Button>
      </div>
    </li>
  );
}
