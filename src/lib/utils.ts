import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind class names: clsx resolves conditionals, twMerge dedupes
// conflicting utilities (last one wins) so `cn("p-2", "p-4")` yields "p-4".
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
