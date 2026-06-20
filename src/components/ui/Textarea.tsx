import * as React from "react";

import { cn } from "@/lib/utils";

// zen textarea: surface fill, 2px ink border, square, IBM Plex Mono,
// muted placeholder, accent focus ring, vertical resize.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-y border-2 px-3 py-2 font-mono text-[14px] transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
