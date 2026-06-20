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
        className="fixed right-6 bottom-6 z-20 inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-purple-900/40 transition-colors hover:bg-purple-500"
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
            className="relative my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0f1529] p-6 text-white shadow-2xl"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add a card</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-lg p-1.5 text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
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
