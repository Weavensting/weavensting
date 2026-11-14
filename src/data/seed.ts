import type { Cookbook, Recipe } from '../domain/types';
import { parseIngredientLines } from '../domain/parseIngredient';
import { buildSteps } from '../domain/recipe';

const CREATED = '2026-01-01T00:00:00.000Z';

export const seedCookbook: Cookbook = {
  id: 'seed-cookbook',
  name: 'Family Cookbook',
  description: 'Everything we actually cook. Sign in to share it with the family.',
  createdAt: CREATED,
  updatedAt: CREATED,
};

interface SeedSpec {
  id: string;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  familyAttribution?: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  notes?: string;
  nutrition?: Recipe['nutrition'];
}

const SEEDS: SeedSpec[] = [
  {
    id: 'seed-cornbread',
    title: 'Skillet Cornbread',
    description: 'Crisp edges from a hot cast-iron pan, soft in the middle.',
    servings: 8,
    prepMinutes: 10,
    cookMinutes: 25,
    familyAttribution: "Grandma Ruth's recipe card",
    tags: ['bread', 'side', 'southern'],
    ingredients: [
      '2 tbsp bacon fat or butter',
      '1 1/2 cups yellow cornmeal',
      '1/2 cup all-purpose flour',
      '1 tbsp sugar',
      '2 tsp baking powder',
      '1 tsp salt',
      '1 1/2 cups buttermilk',
      '2 large eggs, beaten',
    ],
    steps: [
      'Put a 10-inch cast-iron skillet in the oven and heat to 425°F.',
      'Whisk the cornmeal, flour, sugar, baking powder and salt together.',
      'Stir in the buttermilk and eggs until just combined — a few lumps are fine.',
      'Add the fat to the hot skillet, swirl to coat, then pour in the batter.',
      'Bake for 22 to 25 minutes, until the top is golden and springs back.',
      'Let it rest 5 minutes before cutting into wedges.',
    ],
    notes: 'The card says "hot pan or don\'t bother". She was right.',
    nutrition: { calories: 210, proteinG: 6, carbsG: 30, fatG: 7, basis: 'estimated' },
  },
  {
    id: 'seed-sunday-sauce',
    title: 'Sunday Sauce',
    description: 'Simmers all afternoon. Makes enough to freeze half.',
    servings: 8,
    prepMinutes: 20,
    cookMinutes: 180,
    familyAttribution: 'Dad, every other Sunday',
    tags: ['dinner', 'pasta', 'make-ahead'],
    ingredients: [
      '2 tbsp olive oil',
      '1 lb pork shoulder, cut into 2-inch pieces',
      '1 large onion, finely chopped',
      '4 cloves garlic, minced',
      '2 tbsp tomato paste',
      '2 (28 oz) cans whole peeled tomatoes, crushed by hand',
      '1 tsp dried oregano',
      '1 handful basil leaves',
      'Salt and pepper to taste',
    ],
    steps: [
      'Brown the pork in the oil over medium-high heat, about 8 minutes. Set aside.',
      'Lower the heat, cook the onion until soft, 6 to 8 minutes, then add the garlic for 1 minute.',
      'Stir in the tomato paste and cook until it darkens, about 2 minutes.',
      'Add the tomatoes, oregano and the pork with any juices.',
      'Simmer uncovered on the lowest heat for 3 hours, stirring now and then.',
      'Tear in the basil, season, and shred the pork into the sauce.',
    ],
    nutrition: { calories: 320, proteinG: 18, carbsG: 14, fatG: 22, basis: 'estimated' },
  },
  {
    id: 'seed-weeknight-stirfry',
    title: 'Weeknight Garlic Chicken Stir-Fry',
    description: 'On the table in twenty minutes with whatever vegetables are in the drawer.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 10,
    tags: ['dinner', 'quick', 'high-protein'],
    ingredients: [
      '1 lb boneless skinless chicken thighs, sliced thin',
      '2 tbsp soy sauce',
      '1 tbsp cornstarch',
      '2 tbsp vegetable oil',
      '4 cloves garlic, minced',
      '1 tbsp fresh ginger, grated',
      '4 cups mixed vegetables',
      '2 tbsp oyster sauce',
      '2 green onions, sliced',
      'Steamed rice, for serving',
    ],
    steps: [
      'Toss the chicken with the soy sauce and cornstarch; let it sit 10 minutes.',
      'Heat the oil in a wok over high heat until it shimmers.',
      'Sear the chicken in a single layer for 3 minutes without moving it, then stir-fry 2 minutes more.',
      'Add the garlic and ginger and cook for 30 seconds.',
      'Add the vegetables and oyster sauce and stir-fry 3 to 4 minutes until crisp-tender.',
      'Finish with the green onions and serve over rice.',
    ],
    nutrition: { calories: 410, proteinG: 34, carbsG: 22, fatG: 20, basis: 'estimated' },
  },
];

export function seedRecipes(cookbookId: string): Recipe[] {
  return SEEDS.map((spec) => ({
    id: spec.id,
    cookbookId,
    title: spec.title,
    description: spec.description,
    servings: spec.servings,
    prepMinutes: spec.prepMinutes,
    cookMinutes: spec.cookMinutes,
    ingredients: parseIngredientLines(spec.ingredients),
    steps: buildSteps(spec.steps),
    notes: spec.notes,
    tags: spec.tags,
    nutrition: spec.nutrition,
    source: spec.familyAttribution
      ? { method: 'manual' as const, familyAttribution: spec.familyAttribution }
      : { method: 'manual' as const },
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
}
