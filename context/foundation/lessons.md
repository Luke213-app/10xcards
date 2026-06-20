# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Wypychaj migracje na zdalny projekt jako część wdrożenia

- **Context**: Każdy plan lub faza wprowadzająca migrację Supabase (lub inną zmianę schematu DB) w projekcie, gdzie deploy kodu (Cloudflare Workers Builds) i CI (GitHub Actions lint+build) są rozprzęgnięte od deployu schematu — żaden z nich nie dotyka bazy.
- **Problem**: F-01 zweryfikował migrację `create_flashcards` tylko lokalnie (`supabase db reset`), plan wdrożenia był „auth-shell only" i wykluczył tabele, a S-01..S-04 zakładały, że F-01 „shipped the store". Migracja nigdy nie trafiła na zdalny projekt, więc tabela `public.flashcards` tam nie istniała: każdy odczyt/zapis DB zwracał **500 na produkcji** (podczas gdy `/api/generate` bez DB działał). Błąd był utajony od scalenia F-01 i wyszedł dopiero przy pierwszym manualnym teście funkcji bazodanowych przeciw produkcji — wcześniej testowano wyłącznie lokalnie.
- **Rule**: Każdy plan z migracją MUSI mieć jawny krok „zaaplikuj/wypchnij migracje na zdalny/produkcyjny projekt (`supabase db push`) jako część wdrożenia". „Done" dla warstwy DB nigdy nie oznacza tylko „działa lokalnie" — dopóki schema nie jest na zdalnej bazie, slice nie jest dostarczony. Jeśli deploy kodu i schematu są rozprzęgnięte, traktuj push migracji jako osobny, świadomie zautomatyzowany lub odhaczany krok.
- **Applies to**: plan, plan-review, implement, impl-review

## Strip quotes when piping `-o env` output into `$GITHUB_ENV`

- **Context**: Any CI/GitHub Actions step that appends `KEY="value"` output (e.g. `supabase status -o env`) into `$GITHUB_ENV`, where the value is later consumed as a URL/key by the app or tests.
- **Problem**: `supabase status -o env` emits quoted values; `$GITHUB_ENV` keeps the quotes verbatim (no shell eval), so the consumer receives the literal `"http://127.0.0.1:54321"` and URL/value parsing breaks. CI-only, and masked locally by `eval "$(supabase status -o env)"` (the shell strips quotes). In `testing-auth-critical-flow-e2e` p5 the e2e setup project failed with `TypeError: Failed to parse URL from "http://127.0.0.1:54321"/auth/v1/admin/users` on the first PR CI run (2e34b34), fixed in 272c638.
- **Rule**: When piping `KEY="value"` output into `$GITHUB_ENV`, strip wrapping quotes (`| sed -E 's/^([^=]+)="(.*)"$/\1=\2/'`) and filter to only the vars you need; never assume `$GITHUB_ENV` parses like a shell. Do not validate `$GITHUB_ENV` wiring with a local `eval`-based simulation — `eval` strips the quotes and hides the failure CI will hit.
- **Applies to**: implement, plan, plan-review, impl-review
