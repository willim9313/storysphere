/**
 * Faction → colour mapping for the character overview quadrant view and
 * ranking dots. Ten-entry palette cycling through the entity-type tokens
 * plus the four semantic status colours, matching the design canvas's
 * `facColor()` (token names translated per DESIGN_README: character→char,
 * location→loc, organization→org, object→obj, concept→con, event→evt).
 */
const FACTION_PALETTE: Array<[string, string]> = [
  ['--entity-org-bg', '--entity-org-dot'],
  ['--entity-loc-bg', '--entity-loc-dot'],
  ['--entity-char-bg', '--entity-char-dot'],
  ['--entity-evt-bg', '--entity-evt-dot'],
  ['--entity-con-bg', '--entity-con-dot'],
  ['--entity-obj-bg', '--entity-obj-dot'],
  ['--color-info-bg', '--color-info'],
  ['--color-success-bg', '--color-success'],
  ['--color-warning-bg', '--color-warning'],
  ['--color-error-bg', '--color-error'],
];

/** `factionIndex` is the position of the faction in the #6d response's
 * `factions[]` array; `null` means unaffiliated. Returns `[fill, stroke]`
 * as `var(--token)` strings ready to use in inline styles. */
export function getFactionColor(factionIndex: number | null): [string, string] {
  if (factionIndex == null) return ['transparent', 'var(--fg-muted)'];
  const [bg, dot] = FACTION_PALETTE[factionIndex % FACTION_PALETTE.length];
  return [`var(${bg})`, `var(${dot})`];
}
