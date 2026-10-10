import { describe, it, expect } from 'vitest';
import { bandHeight, dominantImportance, fitNode, truncateNodeLabel } from './eventBackboneModel';

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

describe('fitNode', () => {
  it('keeps the design size while the column is wide enough', () => {
    expect(fitNode(99, 34, true)).toEqual({ size: 34, labelWidth: 80 });
  });
  it('narrows the label to the column at laptop width', () => {
    expect(fitNode(57, 34, true)).toEqual({ size: 34, labelWidth: 51 });
  });
  it('drops the label and shrinks the dot when the column is narrow', () => {
    expect(fitNode(27, 34, true)).toEqual({ size: 23, labelWidth: null });
  });
  it('never labels an unlabelled band', () => {
    expect(fitNode(99, 22, false)).toEqual({ size: 22, labelWidth: null });
  });
  it('does not shrink below the minimum dot', () => {
    expect(fitNode(6, 34, true).size).toBe(8);
  });
  it('uses the design size before the plot is measured', () => {
    expect(fitNode(0, 34, true)).toEqual({ size: 34, labelWidth: 80 });
  });
});

describe('dominantImportance', () => {
  const ev = (importance: string | null, analyzed = true) => ({ analyzed, importance });
  const many = (n: number, importance: string | null, analyzed = true) =>
    Array.from({ length: n }, () => ev(importance, analyzed));

  it('flags a book where every analysis came back kernel', () => {
    expect(dominantImportance(many(62, 'KERNEL'))).toEqual({ importance: 'KERNEL', count: 62, analyzed: 62 });
  });
  it('flags satellite dominance too', () => {
    expect(dominantImportance([...many(9, 'SATELLITE'), ev('KERNEL')])?.importance).toBe('SATELLITE');
  });
  it('accepts a real split', () => {
    expect(dominantImportance([...many(8, 'KERNEL'), ...many(4, 'SATELLITE')])).toBeNull();
  });
  it('does not judge fewer than 10 analyzed events', () => {
    expect(dominantImportance(many(9, 'KERNEL'))).toBeNull();
  });
  it('ignores unanalyzed events', () => {
    expect(dominantImportance([...many(2, 'KERNEL'), ...many(44, null, false)])).toBeNull();
  });
});

