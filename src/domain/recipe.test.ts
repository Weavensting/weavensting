import { describe, expect, it } from 'vitest';
import {
  buildSteps, draftToRecipe, extractDurationMinutes, formatIngredient, formatMinutes, scaleFactor,
} from './recipe';
import { convert, formatQuantity, normalizeUnit } from './units';
import { parseIngredientLine } from './parseIngredient';
import { makeRecipe } from './testFixtures';

describe('formatQuantity', () => {
  it('renders kitchen fractions, not decimals', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2');
    expect(formatQuantity(0.25)).toBe('1/4');
    expect(formatQuantity(0.75)).toBe('3/4');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(1 / 3)).toBe('1/3');
    expect(formatQuantity(14.5)).toBe('14 1/2');
  });

  it('falls back to a decimal when no clean fraction fits', () => {
    expect(formatQuantity(2.3)).toBe('2.3');
    expect(formatQuantity(0.07)).toBe('0.07');
  });
});

describe('convert', () => {
  it('converts within a kind', () => {
    expect(convert(1, 'cup', 'tbsp')).toBeCloseTo(16, 1);
    expect(convert(1000, 'g', 'kg')).toBe(1);
    expect(convert(1, 'lb', 'oz')).toBeCloseTo(16, 2);
  });

  it('refuses to convert across kinds or between different counts', () => {
    expect(convert(1, 'cup', 'g')).toBeUndefined();
    expect(convert(2, 'clove', 'slice')).toBeUndefined();
  });
});

describe('normalizeUnit', () => {
  it('handles casing, plurals and trailing periods', () => {
    expect(normalizeUnit('CUPS')).toBe('cup');
    expect(normalizeUnit('Tbsp.')).toBe('tbsp');
    expect(normalizeUnit('grams')).toBe('g');
    expect(normalizeUnit('sprinkle')).toBeUndefined();
    expect(normalizeUnit('')).toBeUndefined();
  });
});

describe('formatIngredient', () => {
  it('scales the amount and keeps the rest intact', () => {
    const ingredient = parseIngredientLine('1 1/2 cups all-purpose flour, sifted');
    expect(formatIngredient(ingredient, 1)).toBe('1 1/2 cups all-purpose flour, sifted');
    expect(formatIngredient(ingredient, 2)).toBe('3 cups all-purpose flour, sifted');
    expect(formatIngredient(ingredient, 1 / 3)).toBe('1/2 cup all-purpose flour, sifted');
  });

  it('uses the singular unit at or below one', () => {
    expect(formatIngredient(parseIngredientLine('2 cups milk'), 0.5)).toBe('1 cup milk');
    expect(formatIngredient(parseIngredientLine('1 cup milk'), 0.5)).toBe('1/2 cup milk');
  });

  it('leaves unparseable lines exactly as written', () => {
    expect(formatIngredient(parseIngredientLine('A good glug of olive oil'), 4)).toBe(
      'A good glug of olive oil',
    );
  });

  it('scales both ends of a range', () => {
    expect(formatIngredient(parseIngredientLine('2-3 cloves garlic'), 2)).toBe('4–6 cloves garlic');
  });

  it('keeps the optional marker', () => {
    expect(formatIngredient(parseIngredientLine('1/4 cup walnuts (optional)'), 2)).toBe(
      '1/2 cup walnuts (optional)',
    );
  });
});

describe('extractDurationMinutes', () => {
  it('reads plain durations', () => {
    expect(extractDurationMinutes('Bake for 25 minutes.')).toBe(25);
    expect(extractDurationMinutes('Simmer 1 hour.')).toBe(60);
    expect(extractDurationMinutes('Rest 30 sec')).toBe(0.5);
  });

  it('takes the upper bound of a range', () => {
    expect(extractDurationMinutes('Bake 20-25 minutes')).toBe(25);
    expect(extractDurationMinutes('Bake 20 to 25 minutes')).toBe(25);
  });

  it('takes the longest when a step names several', () => {
    expect(extractDurationMinutes('Sear 2 minutes, then braise 2 hours.')).toBe(120);
  });

  it('returns nothing when there is no duration', () => {
    expect(extractDurationMinutes('Season with salt.')).toBeUndefined();
  });
});

describe('buildSteps', () => {
  it('strips numbering and attaches timers', () => {
    const steps = buildSteps(['1. Mix the dry ingredients.', '2) Bake for 25 minutes.', '   ']);
    expect(steps).toHaveLength(2);
    expect(steps[0].text).toBe('Mix the dry ingredients.');
    expect(steps[0].durationMinutes).toBeUndefined();
    expect(steps[1].durationMinutes).toBe(25);
  });
});

describe('formatMinutes', () => {
  it('reads the way a person would say it', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 hr');
    expect(formatMinutes(95)).toBe('1 hr 35 min');
    expect(formatMinutes(undefined)).toBe('');
  });
});

describe('scaleFactor', () => {
  it('is the ratio of target to original servings', () => {
    expect(scaleFactor(makeRecipe({ title: 'x', servings: 4 }), 8)).toBe(2);
    expect(scaleFactor(makeRecipe({ title: 'x', servings: 0 }), 8)).toBe(1);
  });
});

describe('draftToRecipe', () => {
  it('parses lines and fills sensible defaults', () => {
    const recipe = draftToRecipe(
      {
        title: '  Grandma Ruth’s Cornbread  ',
        ingredientLines: ['1 cup cornmeal', '', '1 tsp salt'],
        stepTexts: ['Mix.', 'Bake for 30 minutes.'],
        tags: ['Bread', 'bread', ' Southern '],
      },
      { cookbookId: 'cookbook-1' },
    );

    expect(recipe.title).toBe('Grandma Ruth’s Cornbread');
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.ingredients[0].unit).toBe('cup');
    expect(recipe.steps[1].durationMinutes).toBe(30);
    expect(recipe.tags).toEqual(['bread', 'southern']);
  });

  it('never saves an empty title', () => {
    expect(draftToRecipe({ ingredientLines: [], stepTexts: [] }, { cookbookId: 'c' }).title).toBe(
      'Untitled recipe',
    );
  });
});
