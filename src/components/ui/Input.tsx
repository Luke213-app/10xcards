import * as React from "react";

import { cn } from "@/lib/utils";

// zen text input: surface fill, 2px ink border, square, IBM Plex Mono,
// muted placeholder, accent focus ring.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full border-2 px-3 py-2 font-mono text-[14px] transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
