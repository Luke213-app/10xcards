import { useState } from "react";
import { Sparkles, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import GenerateView from "@/components/generate/GenerateView";
import ManualCardForm from "@/components/manual/ManualCardForm";

// Consolidated creation surface (R4): one control switches between the existing
// AI-generation and hand-authoring flows. Defaults to AI; /cards/new redirects
// here with ?mode=manual so the old manual page lands directly in Manual.
type Mode = "ai" | "manual";

interface Props {
  initialMode?: Mode;
  /** Forwarded to the underlying flows; fires after each successful save. */
  onSaved?: () => void;
}

export default function CreateCard({ initialMode = "ai", onSaved }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const tabs: { value: Mode; label: string; icon: typeof Sparkles }[] = [
    { value: "ai", label: "AI", icon: Sparkles },
    { value: "manual", label: "Manual", icon: PenLine },
  ];

  return (
    <div className="space-y-6">
      <div className="border-foreground bg-card inline-flex border-2 p-1" role="tablist" aria-label="Creation mode">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMode(tab.value);
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium tracking-[0.08em] uppercase transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mode === "ai" ? (
        <GenerateView onSaved={onSaved} />
      ) : (
        <ManualCardForm heading="New flashcard" intro="Type a question and its answer, then save." onSaved={onSaved} />
      )}
    </div>
  );
}
