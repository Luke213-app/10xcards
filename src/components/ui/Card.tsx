import * as React from "react";

import { cn } from "@/lib/utils";

// React counterpart of Card.astro for use inside hydrated islands.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("zen-shadow bg-card text-card-foreground", className)} {...props} />;
}

export { Card };
