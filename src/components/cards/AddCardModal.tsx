import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import CreateCard from "@/components/generate/CreateCard";

// Floating "Add card" entry on /cards. Opens the consolidated creation surface
// (AI/Manual toggle) in a modal that can be dismissed at any stage via the
// close button, the Escape key, or a backdrop click. If at least one card was
// saved while open, the page reloads on close so the new cards show up in the
// server-rendered list.
export default function AddCardModal() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    if (saved) {
      window.location.reload();
    }
  }, [saved]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-label="Add card"
        className="zen-shadow zen-press bg-primary text-primary-foreground fixed right-6 bottom-6 z-20 inline-flex items-center gap-2 px-5 py-3 text-[11px] font-medium tracking-[0.08em] uppercase hover:bg-[var(--accent-press)]"
      >
        <Plus className="size-[18px]" />
        Add card
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Add a card"
        >
          <div
            className="zen-shadow bg-card text-foreground relative my-8 w-full max-w-2xl p-6"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-foreground font-sans text-lg font-extrabold">Add a card</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground p-1.5 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>
            <CreateCard
              onSaved={() => {
                setSaved(true);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
