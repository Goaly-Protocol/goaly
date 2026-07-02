import { describe, expect, test } from 'bun:test';
import { resolveTeam } from './resolve';

describe('resolveTeam', () => {
  test('resolves by canonical name', () => {
    const m = resolveTeam('Argentina');
    expect(m).toEqual({
      name: 'Argentina',
      code: 'ARG',
      iso: 'ar',
      logo: 'https://flagcdn.com/w80/ar.png',
    });
  });

  test('is case/whitespace/diacritic insensitive', () => {
    expect(resolveTeam('  bRaZiL ')?.code).toBe('BRA');
    expect(resolveTeam('Côte d’Ivoire')?.code).toBe('CIV');
  });

  test('resolves by alias and by code', () => {
    expect(resolveTeam('Korea Republic')?.code).toBe('KOR');
    expect(resolveTeam('USA')?.code).toBe('USA');
    expect(resolveTeam('ENG')?.name).toBe('England');
  });

  test('subdivision flags for home nations', () => {
    expect(resolveTeam('England')?.logo).toBe('https://flagcdn.com/w80/gb-eng.png');
    expect(resolveTeam('Scotland')?.iso).toBe('gb-sct');
  });

  test('returns null for unknown teams', () => {
    expect(resolveTeam('Atlantis')).toBeNull();
  });
});
