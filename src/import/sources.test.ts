import { describe, expect, it } from 'vitest';
import { detectSource, findUrlInText, normalizeUrl } from './sources';

describe('normalizeUrl', () => {
  it('adds a missing scheme', () => {
    expect(normalizeUrl('example.com/recipe')).toBe('https://example.com/recipe');
  });

  it('strips tracking parameters but keeps real ones', () => {
    expect(normalizeUrl('https://example.com/r?utm_source=pinterest&page=2&fbclid=abc')).toBe(
      'https://example.com/r?page=2',
    );
  });

  it('trusts a dotless host when the scheme was typed out', () => {
    expect(normalizeUrl('http://localhost:8099/recipe')).toBe('http://localhost:8099/recipe');
    expect(normalizeUrl('cornbread')).toBeUndefined();
  });

  it('rejects things that are not web links', () => {
    expect(normalizeUrl('')).toBeUndefined();
    expect(normalizeUrl('just some words')).toBeUndefined();
    expect(normalizeUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeUrl('file:///etc/passwd')).toBeUndefined();
  });
});

describe('findUrlInText', () => {
  it('finds the link inside shared text', () => {
    expect(findUrlInText('Check this out https://example.com/pie thanks!')).toBe('https://example.com/pie');
  });

  it('returns nothing when there is no link', () => {
    expect(findUrlInText('no links here')).toBeUndefined();
  });
});

describe('detectSource', () => {
  it('recognises YouTube in all its shapes', () => {
    expect(detectSource('https://www.youtube.com/watch?v=abc123')).toMatchObject({
      kind: 'youtube', videoId: 'abc123', expectsStructuredData: false,
    });
    expect(detectSource('https://youtu.be/xyz789')?.videoId).toBe('xyz789');
  });

  it('recognises Pinterest and expects to follow it onward', () => {
    expect(detectSource('https://www.pinterest.com/pin/12345/')).toMatchObject({
      kind: 'pinterest', expectsStructuredData: true,
    });
    expect(detectSource('https://pin.it/abc')?.kind).toBe('pinterest');
  });

  it('treats anything else as a recipe site', () => {
    expect(detectSource('https://smittenkitchen.com/2026/pie')).toMatchObject({
      kind: 'recipe-site', method: 'url', expectsStructuredData: true,
    });
  });

  it('returns nothing for non-links', () => {
    expect(detectSource('grandma’s cornbread')).toBeUndefined();
  });
});
