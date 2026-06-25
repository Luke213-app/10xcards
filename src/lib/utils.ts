// Throwaway change to exercise the AI Code Review path filter (src/**).
// Safe to revert — see context/changes/code-review/plan.md Phase 4.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
