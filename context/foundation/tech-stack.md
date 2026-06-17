---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo builder shipping an AI-flashcard MVP after-hours in 3 weeks needs a battle-tested, agent-friendly starter that delivers auth, a database, and deploy out of the box so the time goes to the product, not the plumbing. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for `(web, js)` and clears all four agent-friendly gates. Supabase auth covers the email/password accounts (FR-001/002); Supabase Postgres with row-level security gives server-side, cross-device persistence and satisfies the user-data-isolation and no-data-loss guardrails; TypeScript with Zod boundaries suits validating LLM output into candidate cards (has_ai). Payments, realtime, and background jobs are out of scope per the PRD non-goals. The Cloudflare edge runtime constrains long-running tasks, so the AI generation flow should stream or chunk progress — which the >2s progress-feedback NFR already anticipates. Deployment lands on Cloudflare Pages (starter default); CI runs on GitHub Actions with auto-deploy-on-merge, the shape the starter ships with. Bootstrapper confidence is first-class — expect mostly-smooth scaffolding with occasional manual steps.
