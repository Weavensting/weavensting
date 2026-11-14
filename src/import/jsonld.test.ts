import { describe, expect, it } from 'vitest';
import { extractRecipeFromHtml, stripHtml } from './jsonld';
import { parseISODuration, parseServings } from './duration';

const page = (jsonld: unknown, extraHead = '') => `
<!DOCTYPE html><html><head>${extraHead}
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head><body></body></html>`;

const fullRecipe = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Brown Butter Chocolate Chip Cookies',
  description: 'Chewy in the middle, crisp at the edge.',
  image: ['https://example.com/cookies.jpg'],
  author: { '@type': 'Person', name: 'Sam Baker' },
  publisher: { '@type': 'Organization', name: 'Example Kitchen' },
  recipeYield: '24 cookies',
  prepTime: 'PT20M',
  cookTime: 'PT12M',
  keywords: 'cookies, dessert, brown butter',
  recipeCategory: 'Dessert',
  recipeCuisine: 'American',
  recipeIngredient: ['1 cup butter', '2 &frac12; cups all-purpose flour', '1 tsp salt'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Brown the butter.' },
    { '@type': 'HowToStep', text: 'Mix in the flour and salt.' },
    { '@type': 'HowToStep', text: 'Bake for 12 minutes.' },
  ],
  nutrition: {
    '@type': 'NutritionInformation',
    calories: '210 kcal', proteinContent: '3 g', carbohydrateContent: '28 g', fatContent: '11 g',
  },
};

describe('extractRecipeFromHtml', () => {
  it('reads a complete schema.org recipe', () => {
    const draft = extractRecipeFromHtml(page(fullRecipe), 'https://example.com/cookies')!;
    expect(draft.title).toBe('Brown Butter Chocolate Chip Cookies');
    expect(draft.servings).toBe(24);
    expect(draft.prepMinutes).toBe(20);
    expect(draft.cookMinutes).toBe(12);
    expect(draft.imageUri).toBe('https://example.com/cookies.jpg');
    expect(draft.ingredientLines).toHaveLength(3);
    expect(draft.stepTexts).toEqual(['Brown the butter.', 'Mix in the flour and salt.', 'Bake for 12 minutes.']);
    expect(draft.source?.author).toBe('Sam Baker');
    expect(draft.source?.siteName).toBe('Example Kitchen');
    expect(draft.confidence).toBe(1);
  });

  it('decodes HTML entities in ingredients', () => {
    expect(extractRecipeFromHtml(page(fullRecipe))!.ingredientLines[1]).toBe('2 ½ cups all-purpose flour');
  });

  it('reads nutrition, marked as coming from the source', () => {
    expect(extractRecipeFromHtml(page(fullRecipe))!.nutrition).toMatchObject({
      calories: 210, proteinG: 3, carbsG: 28, fatG: 11, basis: 'source',
    });
  });

  it('collects tags from keywords, category and cuisine', () => {
    expect(extractRecipeFromHtml(page(fullRecipe))!.tags).toEqual([
      'cookies', 'dessert', 'brown butter', 'american',
    ]);
  });

  it('finds a recipe inside an @graph', () => {
    const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: 'Blog' }, fullRecipe] };
    expect(extractRecipeFromHtml(page(graph))?.title).toBe('Brown Butter Chocolate Chip Cookies');
  });

  it('handles an array at the top level', () => {
    expect(extractRecipeFromHtml(page([{ '@type': 'Organization' }, fullRecipe]))?.title).toBeTruthy();
  });

  it('handles a multi-valued @type', () => {
    expect(extractRecipeFromHtml(page({ ...fullRecipe, '@type': ['Recipe', 'NewsArticle'] }))?.title).toBeTruthy();
  });

  it('flattens HowToSection groups into a flat step list', () => {
    const sectioned = {
      ...fullRecipe,
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Dough', itemListElement: [{ '@type': 'HowToStep', text: 'Mix.' }] },
        { '@type': 'HowToSection', name: 'Bake', itemListElement: [{ '@type': 'HowToStep', text: 'Bake.' }] },
      ],
    };
    expect(extractRecipeFromHtml(page(sectioned))?.stepTexts).toEqual(['Mix.', 'Bake.']);
  });

  it('splits a single instruction blob into steps', () => {
    const blob = { ...fullRecipe, recipeInstructions: 'Brown the butter.\nMix everything.\nBake 12 minutes.' };
    expect(extractRecipeFromHtml(page(blob))?.stepTexts).toHaveLength(3);
  });

  it('strips HTML left inside instruction text', () => {
    const dirty = { ...fullRecipe, recipeInstructions: [{ '@type': 'HowToStep', text: '<p>Bake <b>12</b> minutes.</p>' }] };
    expect(extractRecipeFromHtml(page(dirty))?.stepTexts).toEqual(['Bake 12 minutes.']);
  });

  it('derives cook time from total minus prep', () => {
    expect(extractRecipeFromHtml(page({ ...fullRecipe, cookTime: undefined, totalTime: 'PT45M' }))?.cookMinutes).toBe(25);
  });

  it('falls back to og:site_name for the source', () => {
    const html = page({ ...fullRecipe, publisher: undefined }, '<meta property="og:site_name" content="Smitten Cooking">');
    expect(extractRecipeFromHtml(html)?.source?.siteName).toBe('Smitten Cooking');
  });

  it('falls back to the hostname when nothing names the site', () => {
    expect(
      extractRecipeFromHtml(page({ ...fullRecipe, publisher: undefined }), 'https://www.seriousfood.com/x')?.source?.siteName,
    ).toBe('seriousfood.com');
  });

  it('returns nothing for a page with no recipe markup', () => {
    expect(extractRecipeFromHtml('<html><body>Just a blog post</body></html>')).toBeUndefined();
    expect(extractRecipeFromHtml(page({ '@type': 'Article', name: 'Not a recipe' }))).toBeUndefined();
  });

  it('ignores recipe markup with neither ingredients nor steps', () => {
    expect(extractRecipeFromHtml(page({ '@type': 'Recipe', name: 'Stub' }))).toBeUndefined();
  });

  it('survives malformed JSON without throwing', () => {
    const broken = '<script type="application/ld+json">{ not json </script>';
    expect(() => extractRecipeFromHtml(broken)).not.toThrow();
    expect(extractRecipeFromHtml(broken)).toBeUndefined();
  });

  it('recovers from trailing commas some sites emit', () => {
    const sloppy = `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["1 cup flour",],}</script>`;
    expect(extractRecipeFromHtml(sloppy)?.title).toBe('X');
  });

  it('warns when the markup is missing half the recipe', () => {
    const draft = extractRecipeFromHtml(page({ '@type': 'Recipe', name: 'X', recipeIngredient: ['1 cup flour'] }))!;
    expect(draft.warnings).toContain('No instructions found in the page markup.');
    expect(draft.confidence).toBeLessThan(1);
  });
});

describe('parseISODuration', () => {
  it('reads ISO durations', () => {
    expect(parseISODuration('PT30M')).toBe(30);
    expect(parseISODuration('PT1H30M')).toBe(90);
    expect(parseISODuration('PT2H')).toBe(120);
    expect(parseISODuration('P1DT2H')).toBe(1560);
  });

  it('reads human text some sites put there instead', () => {
    expect(parseISODuration('1 hr 20 mins')).toBe(80);
    expect(parseISODuration('45 minutes')).toBe(45);
  });

  it('returns undefined rather than zero for unknown values', () => {
    expect(parseISODuration('')).toBeUndefined();
    expect(parseISODuration('PT')).toBeUndefined();
    expect(parseISODuration(undefined)).toBeUndefined();
  });
});

describe('parseServings', () => {
  it('pulls a number out of the usual phrasings', () => {
    expect(parseServings('4 servings')).toBe(4);
    expect(parseServings('Serves 6')).toBe(6);
    expect(parseServings(8)).toBe(8);
    expect(parseServings(['4 servings'])).toBe(4);
  });

  it('takes the low end of a range', () => {
    expect(parseServings('6-8 servings')).toBe(6);
  });

  it('gives up cleanly', () => {
    expect(parseServings('a crowd')).toBeUndefined();
  });
});

describe('stripHtml', () => {
  it('turns block tags into line breaks', () => {
    expect(stripHtml('<p>One</p><p>Two</p>')).toBe('One\nTwo');
    expect(stripHtml('A<br>B')).toBe('A\nB');
  });
});
