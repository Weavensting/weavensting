import { describe, expect, it } from 'vitest';
import { parseIngredientLine, parseIngredientLines } from './parseIngredient';

describe('parseIngredientLine', () => {
  it('keeps the original text untouched', () => {
    expect(parseIngredientLine('  1 1/2 cups all-purpose flour, sifted ').raw).toBe(
      '1 1/2 cups all-purpose flour, sifted',
    );
  });

  it('parses a mixed number and unit', () => {
    const r = parseIngredientLine('1 1/2 cups all-purpose flour, sifted');
    expect(r.quantity).toBe(1.5);
    expect(r.unit).toBe('cup');
    expect(r.item).toBe('all-purpose flour');
    expect(r.preparation).toBe('sifted');
  });

  it('parses vulgar fractions', () => {
    expect(parseIngredientLine('½ tsp salt').quantity).toBe(0.5);
    expect(parseIngredientLine('1½ cups milk').quantity).toBe(1.5);
    expect(parseIngredientLine('¾ cup sugar').unit).toBe('cup');
  });

  it('reads a bare fraction as a fraction, not a whole number', () => {
    const r = parseIngredientLine('1/2 cup brown sugar');
    expect(r.quantity).toBe(0.5);
    expect(r.item).toBe('brown sugar');
  });

  it('normalises unit spellings and trailing periods', () => {
    expect(parseIngredientLine('2 Tbsp. butter, melted').unit).toBe('tbsp');
    expect(parseIngredientLine('2 tablespoons butter').unit).toBe('tbsp');
    expect(parseIngredientLine('500 g bread flour').unit).toBe('g');
    expect(parseIngredientLine('1 lb ground beef').unit).toBe('lb');
  });

  it('distinguishes T from t', () => {
    expect(parseIngredientLine('1 T olive oil').unit).toBe('tbsp');
    expect(parseIngredientLine('1 t vanilla').unit).toBe('tsp');
  });

  it('parses ranges', () => {
    const r = parseIngredientLine('2-3 cloves garlic, minced');
    expect(r.quantity).toBe(2);
    expect(r.quantityMax).toBe(3);
    expect(r.unit).toBe('clove');
    expect(r.item).toBe('garlic');

    const w = parseIngredientLine('2 to 3 cups chicken stock');
    expect(w.quantity).toBe(2);
    expect(w.quantityMax).toBe(3);
  });

  it('handles a container size in parentheses', () => {
    const r = parseIngredientLine('1 (14.5 oz) can diced tomatoes');
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe('can');
    expect(r.item).toBe('diced tomatoes');
    expect(r.preparation).toBe('14.5 oz');
  });

  it('marks optional ingredients', () => {
    const r = parseIngredientLine('1/4 cup chopped walnuts (optional)');
    expect(r.optional).toBe(true);
    expect(r.quantity).toBe(0.25);
    expect(r.item).toBe('chopped walnuts');
  });

  it('treats a trailing phrase as preparation even without a comma', () => {
    const r = parseIngredientLine('Salt and pepper to taste');
    expect(r.quantity).toBeUndefined();
    expect(r.item).toBe('Salt and pepper');
    expect(r.preparation).toBe('to taste');
  });

  it('drops "of" after a unit', () => {
    expect(parseIngredientLine('1 cup of whole milk').item).toBe('whole milk');
  });

  it('does not mistake a food name for a unit', () => {
    const r = parseIngredientLine('3 large eggs');
    expect(r.quantity).toBe(3);
    expect(r.unit).toBeUndefined();
    expect(r.item).toBe('large eggs');
  });

  it('recognises recipe counters as units', () => {
    expect(parseIngredientLine('1 sheet puff pastry').unit).toBe('sheet');
    expect(parseIngredientLine('2 sticks butter').unit).toBe('stick');
    expect(parseIngredientLine('3 sprigs thyme').item).toBe('thyme');
  });

  it('strips list bullets and numbering', () => {
    expect(parseIngredientLine('• 2 cups rice').item).toBe('rice');
    expect(parseIngredientLine('1. 2 cups rice').item).toBe('rice');
  });

  it('keeps a comma that is part of the food name', () => {
    const r = parseIngredientLine('1 cup flour, plus more for dusting');
    expect(r.item).toBe('flour');
    expect(r.preparation).toBe('plus more for dusting');
  });
});

describe('parseIngredientLines', () => {
  it('assigns group headings to the lines beneath them', () => {
    const items = parseIngredientLines([
      'For the cake:',
      '2 cups flour',
      '1 cup sugar',
      'STREUSEL TOPPING',
      '1/2 cup brown sugar',
    ]);
    expect(items).toHaveLength(3);
    expect(items[0].group).toBe('cake');
    expect(items[1].group).toBe('cake');
    expect(items[2].group).toBe('STREUSEL TOPPING');
    expect(items[2].item).toBe('brown sugar');
  });

  it('skips blank lines', () => {
    expect(parseIngredientLines(['2 cups flour', '', '   ', '1 tsp salt'])).toHaveLength(2);
  });
});
