import { TEAMS } from './teams';
import type { TeamMeta } from './types';

/** Diacritic-insensitive, whitespace/case-normalized key. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Flag/badge URL for a flagcdn key. */
export function flagUrl(iso: string, width = 80): string {
  return `https://flagcdn.com/w${width}/${iso}.png`;
}

const INDEX: Map<string, TeamMeta> = (() => {
  const map = new Map<string, TeamMeta>();
  for (const team of TEAMS) {
    const meta: TeamMeta = {
      name: team.name,
      code: team.code,
      iso: team.iso,
      logo: flagUrl(team.iso),
    };
    map.set(normalize(team.name), meta);
    map.set(normalize(team.code), meta);
    for (const alias of team.aliases ?? []) map.set(normalize(alias), meta);
  }
  return map;
})();

/** Resolve a team name (or code/alias) to its metadata, or `null` if unknown. */
export function resolveTeam(name: string): TeamMeta | null {
  return INDEX.get(normalize(name)) ?? null;
}
