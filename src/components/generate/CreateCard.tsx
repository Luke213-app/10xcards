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
}

export default function CreateCard({ initialMode = "ai" }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const tabs: { value: Mode; label: string; icon: typeof Sparkles }[] = [
    { value: "ai", label: "AI", icon: Sparkles },
    { value: "manual", label: "Manual", icon: PenLine },
  ];

  return (
    <div className="space-y-6">
      <div
        className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1"
        role="tablist"
        aria-label="Creation mode"
      >
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
                "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-purple-600 text-white" : "text-blue-100/70 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mode === "ai" ? (
        <GenerateView />
      ) : (
        <ManualCardForm heading="New flashcard" intro="Type a question and its answer, then save." />
      )}
    </div>
  );
}
