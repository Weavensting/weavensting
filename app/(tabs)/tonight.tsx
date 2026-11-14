import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLibrary } from '../../src/state/useLibrary';
import { searchRecipes } from '../../src/domain/search';
import { Body, Button, Chip, EmptyState, Field, Heading, Loading, Screen } from '../../src/ui/components';
import { RecipeCard } from '../../src/ui/components/RecipeCard';
import { spacing, useTheme } from '../../src/ui/theme';

/**
 * "What can I make tonight" — the pantry and macro view of the same cookbook.
 *
 * Shopping tolerance is the main control: zero means cook with what is in the
 * house, one or two means a quick stop on the way home.
 */

const TOLERANCES = [
  { value: 0, label: 'Have everything' },
  { value: 1, label: 'Missing 1' },
  { value: 2, label: 'Missing 2' },
  { value: 3, label: 'Missing 3' },
];

export default function TonightScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, recipes, pantry } = useLibrary();

  const [tolerance, setTolerance] = useState(1);
  const [maxMinutes, setMaxMinutes] = useState('');
  const [maxCalories, setMaxCalories] = useState('');
  const [minProtein, setMinProtein] = useState('');

  const results = useMemo(
    () =>
      searchRecipes(
        recipes,
        {
          maxMissingIngredients: tolerance,
          maxTotalMinutes: toNumber(maxMinutes),
          maxCalories: toNumber(maxCalories),
          minProteinG: toNumber(minProtein),
          requireNutrition: Boolean(toNumber(maxCalories) || toNumber(minProtein)),
          sort: 'pantry',
        },
        { pantry },
      ),
    [recipes, pantry, tolerance, maxMinutes, maxCalories, minProtein],
  );

  if (status === 'loading') return <Loading />;

  const stocked = pantry.filter((item) => !item.deletedAt).length;

  return (
    <Screen>
      <FlatList
        data={results}
        keyExtractor={(item) => item.recipe.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Heading level={2}>What can I make?</Heading>
              <Body muted>
                {stocked === 0
                  ? 'Add what is in your kitchen to the Pantry tab and this fills up. Staples like salt, flour and oil are assumed.'
                  : `Matching against ${stocked} ${stocked === 1 ? 'item' : 'items'} in your pantry, plus the usual staples.`}
              </Body>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {TOLERANCES.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={tolerance === option.value}
                  onPress={() => setTolerance(option.value)}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Field label="Max minutes" value={maxMinutes} onChangeText={setMaxMinutes} placeholder="45" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="Max calories" value={maxCalories} onChangeText={setMaxCalories} placeholder="600" keyboardType="numeric" style={{ flex: 1 }} />
              <Field label="Min protein (g)" value={minProtein} onChangeText={setMinProtein} placeholder="30" keyboardType="numeric" style={{ flex: 1 }} />
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const missing = item.pantry?.missing ?? [];
          return (
            <RecipeCard
              recipe={item.recipe}
              onPress={() => router.push(`/recipe/${item.recipe.id}`)}
              footer={
                <Body
                  style={{ fontSize: 13, marginTop: 2, color: missing.length === 0 ? theme.success : theme.warning }}
                >
                  {missing.length === 0
                    ? 'You have everything'
                    : `Need ${missing.map((i) => i.item).join(', ')}`}
                </Body>
              }
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title={stocked === 0 ? 'Tell me what you have' : 'Nothing matches yet'}
            message={
              stocked === 0
                ? 'Add a few things from your fridge and cupboard, and recipes you can cook right now will show up here.'
                : 'Try allowing a couple of missing ingredients, or loosening the time and macro limits.'
            }
            action={
              stocked === 0 ? (
                <Button label="Fill the pantry" onPress={() => router.push('/pantry')} />
              ) : (
                <Button label="Allow 3 missing" variant="secondary" onPress={() => setTolerance(3)} />
              )
            }
          />
        }
      />
    </Screen>
  );
}

function toNumber(text: string): number | undefined {
  const value = parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
