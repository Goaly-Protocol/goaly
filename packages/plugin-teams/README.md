# @goaly/plugin-teams

Team metadata resolver — maps team names to FIFA codes and flag/logo URLs.

Sports feeds name the same country in many ways ("United States", "USA", "Korea Republic"). Goaly's
World-Cup-themed UI wants a clean FIFA code and a flag for each side. This package resolves any of those
names to consistent metadata from a small built-in table — no network calls, no extra API credits — so
the [Goaly](https://goaly.fun) API and app can render matches the moment odds arrive.

## What it does

- **Resolve** — turn a team name, FIFA code or known alias into `{ name, code, iso, logo }`.
- **Fuzzy-tolerant** — matching is case-, whitespace- and diacritic-insensitive ("Côte d'Ivoire" → CIV).
- **Flags** — builds [flagcdn](https://flagcdn.com) image URLs (including subdivisions like `gb-eng`).
- **Built-in table** — 64 national teams with FIFA codes, ISO flag keys and common aliases; zero deps.

## Usage

```ts
import { resolveTeam, flagUrl } from '@goaly/plugin-teams';

resolveTeam('Korea Republic');
// { name: 'South Korea', code: 'KOR', iso: 'kr', logo: 'https://flagcdn.com/w80/kr.png' }

resolveTeam('unknown fc'); // null

flagUrl('ar', 160); // 'https://flagcdn.com/w160/ar.png'
```

## API

- **`resolveTeam(name)`** — resolve a name / code / alias to `TeamMeta`, or `null` if unknown.
- **`flagUrl(iso, width?)`** — build a flagcdn flag/badge image URL.
- **`TEAMS`** — the built-in `TeamEntry[]` table of national teams.
- **`TeamMeta`** / **`TeamEntry`** — the resolved metadata and source-entry types.

---

Internal workspace package of the Goaly monorepo — not published to npm.
