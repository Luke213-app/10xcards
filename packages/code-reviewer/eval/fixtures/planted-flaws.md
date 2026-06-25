# Planted flaws — React 16 → 19 migration diff

This diff (`react-migration.diff`) claims to migrate a small app from React 16 to
React 19. It contains **exactly three** impactful, distinct, deliberately-planted
flaws. A correct review must surface all three. Each is described by its
**mechanism** so a judge can confirm the review identified the real issue, not a
generic concern.

## Flaw 1 — `ReactDOM.render` left in place (removed in React 19)

`src/index.jsx` adds `import { createRoot } from 'react-dom/client'` (signalling
intent to migrate) but the entry point still calls
`ReactDOM.render(<App />, container)`. `ReactDOM.render` was **removed in React 18
and is gone in React 19** — at runtime the app fails to mount / renders nothing,
and `createRoot` is imported but never used. The fix is
`createRoot(container).render(<App />)`.

A review catches this only if it flags that `ReactDOM.render` is removed/no longer
works in React 19 (or that `createRoot` must be used instead) — not merely that
there is an unused import.

## Flaw 2 — `defaultProps` on a function component (ignored in React 19)

`src/components/UserList.jsx` is migrated from a class to a function component but
keeps `UserList.defaultProps = { endpoint, title }`. **React 19 no longer applies
`defaultProps` to function components.** When `UserList` is rendered without a
`title` prop, `title` is `undefined`, so `title.toUpperCase()` throws a runtime
`TypeError` (and `endpoint` is `undefined`, breaking the fetch). The fix is ES
default parameters: `function UserList({ endpoint = '/api/users', title = 'Users' })`.

A review catches this only if it ties the broken default to React 19 dropping
`defaultProps` support for function components (or flags `title.toUpperCase()`
crashing on the undefined default) — not merely a style note about `defaultProps`.

## Flaw 3 — `useEffect` missing the `endpoint` dependency (stale refetch regression)

The class component re-fetched whenever the `endpoint` prop changed
(`componentDidUpdate`). The migrated `useEffect` uses an empty dependency array
`[]`, so it fetches **once on mount and never again**. When the parent passes a new
`endpoint`, the list silently shows stale data — a behavioral regression versus the
pre-migration component. The fix is `}, [endpoint]);`.

A review catches this only if it identifies the missing `endpoint` dependency (or
the lost componentDidUpdate refetch behavior) — not merely a generic "check your
hooks" remark.
