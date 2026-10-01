import { describe, expect, it } from 'vitest';

import { formatElapsed, murmurPillVariant, partitionFiles, queueNo } from './uploadModel';

const MB = 1024 * 1024;
const f = (name: string, mb: number) => ({ name, size: mb * MB });

describe('partitionFiles', () => {
  it('returns empty lists for no files', () => {
    expect(partitionFiles([])).toEqual({ valid: [], rejected: [] });
  });

  it('keeps valid files and rejects each bad one in order', () => {
    const files = [f('a.pdf', 8), f('b.mobi', 1), f('c.EPUB', 2), f('d.pdf', 62.4)];
    const { valid, rejected } = partitionFiles(files);
    expect(valid.map((x) => x.name)).toEqual(['a.pdf', 'c.EPUB']);
    expect(rejected).toEqual([
      { name: 'b.mobi', reason: 'format' },
      { name: 'd.pdf', reason: 'size' },
    ]);
  });

  it('reports format before size for an oversized unsupported file', () => {
    expect(partitionFiles([f('big.mobi', 80)]).rejected).toEqual([{ name: 'big.mobi', reason: 'format' }]);
  });

  it('accepts a file exactly at the 50 MB limit', () => {
    expect(partitionFiles([f('edge.txt', 50)]).valid).toHaveLength(1);
  });
});

describe('queueNo', () => {
  it('zero-pads and starts after the form file', () => {
    expect(queueNo(0)).toBe('02');
    expect(queueNo(8)).toBe('10');
  });
});

describe('murmurPillVariant', () => {
  it('maps entity types onto the kit taxonomy', () => {
    expect(murmurPillVariant('character')).toBe('character');
    expect(murmurPillVariant('location')).toBe('location');
    expect(murmurPillVariant('org')).toBe('organization');
    expect(murmurPillVariant('event')).toBe('event');
    expect(murmurPillVariant('symbol')).toBe('concept');
  });

  it('returns null for non-entity types', () => {
    expect(murmurPillVariant('topic')).toBeNull();
    expect(murmurPillVariant('raw')).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats mm:ss and clamps negatives', () => {
    expect(formatElapsed(257)).toBe('04:17');
    expect(formatElapsed(-5)).toBe('00:00');
    expect(formatElapsed(3725)).toBe('62:05');
  });
});
