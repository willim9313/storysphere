import { describe, it, expect } from 'vitest';
import { bandHeight, truncateNodeLabel } from './eventBackboneModel';

describe('truncateNodeLabel', () => {
  it('keeps names of 5 characters or fewer', () => {
    expect(truncateNodeLabel('退名之潮開')).toBe('退名之潮開');
    expect(truncateNodeLabel('短')).toBe('短');
  });
  it('truncates beyond 5 characters', () => {
    expect(truncateNodeLabel('伊內絲發現鹽甦醒')).toBe('伊內絲發現…');
  });
  it('does not split surrogate pairs', () => {
    expect(truncateNodeLabel('𠮷𠮷𠮷𠮷𠮷𠮷')).toBe('𠮷𠮷𠮷𠮷𠮷…');
  });
});

describe('bandHeight', () => {
  it('is densest column x row pitch plus 14px above and below', () => {
    expect(bandHeight(2, 28)).toBe(84);
    expect(bandHeight(3, 24)).toBe(100);
  });
  it('reserves one row for an empty band', () => {
    expect(bandHeight(0, 24)).toBe(52);
  });
});
