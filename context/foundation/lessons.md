# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Wypychaj migracje na zdalny projekt jako część wdrożenia

- **Context**: Każdy plan lub faza wprowadzająca migrację Supabase (lub inną zmianę schematu DB) w projekcie, gdzie deploy kodu (Cloudflare Workers Builds) i CI (GitHub Actions lint+build) są rozprzęgnięte od deployu schematu — żaden z nich nie dotyka bazy.
- **Problem**: F-01 zweryfikował migrację `create_flashcards` tylko lokalnie (`supabase db reset`), plan wdrożenia był „auth-shell only" i wykluczył tabele, a S-01..S-04 zakładały, że F-01 „shipped the store". Migracja nigdy nie trafiła na zdalny projekt, więc tabela `public.flashcards` tam nie istniała: każdy odczyt/zapis DB zwracał **500 na produkcji** (podczas gdy `/api/generate` bez DB działał). Błąd był utajony od scalenia F-01 i wyszedł dopiero przy pierwszym manualnym teście funkcji bazodanowych przeciw produkcji — wcześniej testowano wyłącznie lokalnie.
- **Rule**: Każdy plan z migracją MUSI mieć jawny krok „zaaplikuj/wypchnij migracje na zdalny/produkcyjny projekt (`supabase db push`) jako część wdrożenia". „Done" dla warstwy DB nigdy nie oznacza tylko „działa lokalnie" — dopóki schema nie jest na zdalnej bazie, slice nie jest dostarczony. Jeśli deploy kodu i schematu są rozprzęgnięte, traktuj push migracji jako osobny, świadomie zautomatyzowany lub odhaczany krok.
- **Applies to**: plan, plan-review, implement, impl-review
