// Guards against "t('some.key') points at a key that no longer exists".
// i18next silently returns the key itself when it is missing, so lint/build/knip
// never notice (B-129 and the 309-key cleanup both shipped such regressions).
//
// Static literal keys are scanned from src/**; keys built from template strings
// are listed explicitly in DYNAMIC_KEYS below. Add an entry when you add a new
// template-built key whose set of values is small and known.
import { describe, expect, it } from 'vitest';

const LANGS = ['zh-TW', 'en'] as const;
const NAMESPACES = [
  'common', 'nav', 'library', 'upload', 'analysis', 'settings',
  'chat', 'graph', 'reader', 'frameworks', 'search',
];

type Json = { [k: string]: Json | string };
const localeFiles = import.meta.glob<Json>('./locales/*/*.json', { eager: true, import: 'default' });
const resources: Record<string, Record<string, Json>> = {};
for (const lang of LANGS) {
  resources[lang] = {};
  for (const ns of NAMESPACES) {
    resources[lang][ns] = localeFiles[`./locales/${lang}/${ns}.json`];
  }
}

function resolves(lang: string, ns: string, key: string): boolean {
  const walk = (k: string): boolean => {
    let node: Json | string = resources[lang][ns];
    for (const part of k.split('.')) {
      if (typeof node !== 'object' || node === null || !(part in node)) return false;
      node = node[part];
    }
    return true;
  };
  // i18next plural forms: `key_one` / `key_other` stand for `key`.
  return walk(key) || walk(`${key}_one`) || walk(`${key}_other`) || walk(`${key}_plural`);
}

// Every non-test source file under src/ (paths are relative to src/).
const sourceFiles = import.meta.glob<string>(
  ['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**', '!../api/generated.ts'],
  { eager: true, query: '?raw', import: 'default' },
);

interface Ref { file: string; ns: string[]; key: string }

/** Namespaces a file can be talking about: useTranslation('x'), TFunction<'x'>, ns="x". */
function fileNamespaces(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/useTranslation(?:<'(\w+)'>)?\(\s*(?:'(\w+)')?/g)) {
    if (m[1]) found.add(m[1]);
    if (m[2]) found.add(m[2]);
  }
  for (const m of src.matchAll(/TFunction<'(\w+)'>/g)) found.add(m[1]);
  for (const m of src.matchAll(/\bns="(\w+)"/g)) found.add(m[1]);
  return [...found];
}

/**
 * `const { t: tg } = useTranslation('graph')` declarations, in source order.
 * A call resolves to the nearest preceding declaration of the same alias, because
 * one file often has several components that each bind `t` to a different ns.
 */
function aliasDecls(src: string): { alias: string; ns: string; at: number }[] {
  const out: { alias: string; ns: string; at: number }[] = [];
  for (const m of src.matchAll(/\{[^}]*?\bt(?:\s*:\s*(\w+))?\s*(?:,[^}]*)?\}\s*=\s*useTranslation\(\s*'(\w+)'/g)) {
    out.push({ alias: m[1] ?? 't', ns: m[2], at: m.index ?? 0 });
  }
  return out;
}

// Files that receive an untyped `t` as a parameter: which namespace their callers pass.
const FILE_NS_OVERRIDES: Record<string, string> = {
  'components/narrative/heroJourney.ts': 'analysis',
};

function scan(): Ref[] {
  const refs: Ref[] = [];
  for (const [file, src] of Object.entries(sourceFiles)) {
    const nsList = fileNamespaces(src);
    const decls = aliasDecls(src);
    const rel = file.slice('../'.length);

    const push = (fn: string, raw: string, at: number) => {
      let ns: string[];
      let key = raw;
      const prefixed = /^(\w+):(.+)$/.exec(raw);
      if (prefixed && NAMESPACES.includes(prefixed[1])) {
        ns = [prefixed[1]];
        key = prefixed[2];
      } else {
        const decl = decls.filter((d) => d.alias === fn && d.at < at).pop();
        if (decl) ns = [decl.ns];
        else if (FILE_NS_OVERRIDES[rel]) ns = [FILE_NS_OVERRIDES[rel]];
        else ns = nsList;
      }
      refs.push({ file: rel, ns, key });
    };

    // t('literal') / tg('literal') / i18n.t('literal')
    for (const m of src.matchAll(/(?<![\w.$])(t[A-Za-z]*|i18n\.t)\(\s*'([^'$]+)'/g)) {
      if (!/^[\w-]+(?::[\w-]+)?(?:\.[\w-]+)*$/.test(m[2])) continue;
      // single-word keys are only trusted when the call is clearly i18next
      if (!m[2].includes('.') && !m[2].includes(':') && !decls.some((d) => d.alias === m[1])) continue;
      push(m[1], m[2], m.index ?? 0);
    }
    for (const m of src.matchAll(/i18nKey="([^"{]+)"/g)) push('t', m[1], m.index ?? 0);
  }
  return refs;
}

/** Keys assembled from template strings. Each entry is ns + the fully expanded keys. */
const DYNAMIC_KEYS: { ns: string; keys: string[] }[] = [
  {
    // TensionChapterGrid: t(`${key}Intensity`) with key = (orphan)cellLabel
    ns: 'analysis',
    keys: ['tension.grid.cellLabelIntensity', 'tension.grid.orphanCellLabelIntensity'],
  },
];

describe('i18n keys', () => {
  const refs = scan();

  it('finds a plausible number of static keys (scanner sanity)', () => {
    expect(refs.length).toBeGreaterThan(500);
  });

  it('every static t() key exists in zh-TW and en', () => {
    const missing: string[] = [];
    for (const r of refs) {
      for (const lang of LANGS) {
        const ok = r.ns.some((ns) => resolves(lang, ns, r.key));
        if (!ok) missing.push(`${lang}  ${r.ns.join('|') || '(no ns)'}:${r.key}   <- ${r.file}`);
      }
    }
    expect([...new Set(missing)].sort()).toEqual([]);
  });

  it('every whitelisted dynamic key exists in zh-TW and en', () => {
    const missing: string[] = [];
    for (const { ns, keys } of DYNAMIC_KEYS) {
      for (const key of keys) {
        for (const lang of LANGS) {
          if (!resolves(lang, ns, key)) missing.push(`${lang}  ${ns}:${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
