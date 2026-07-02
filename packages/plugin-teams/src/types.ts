export interface TeamMeta {
  /** Canonical team name. */
  name: string;
  /** FIFA 3-letter code, e.g. "ARG". */
  code: string;
  /** Flag key for flagcdn (ISO 3166-1 alpha-2, or "gb-eng" style subdivisions). */
  iso: string;
  /** Flag / badge image URL. */
  logo: string;
}

export interface TeamEntry {
  name: string;
  code: string;
  iso: string;
  /** Alternative names The Odds API (or others) might use. */
  aliases?: string[];
}
