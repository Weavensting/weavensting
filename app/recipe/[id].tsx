import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { library, useLibrary } from '../../src/state/useLibrary';
import { setPendingDraft } from '../../src/state/draftStore';
import { formatIngredient, formatMinutes, recipeToDraft, scaleFactor, totalMinutes } from '../../src/domain/recipe';
import { matchRecipeToPantry } from '../../src/domain/pantry';
import type { Ingredient, Nutrition } from '../../src/domain/types';
import { Body, Button, Card, Chip, Divider, EmptyState, Heading, Loading, Notice, Screen } from '../../src/ui/components';
import { radius, spacing, typography, useTheme } from '../../src/ui/theme';

export default function RecipeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, recipes, pantry } = useLibrary();

  const recipe = useMemo(() => recipes.find((r) => r.id === id), [recipes, id]);
  const [servings, setServings] = useState<number | undefined>();

  // Pantry state is only meaningful once the cook has told us what they have.
  // With an empty pantry every recipe would claim to be missing everything.
  const hasPantry = pantry.some((item) => !item.deletedAt);
  const match = useMemo(
    () => (recipe && hasPantry ? matchRecipeToPantry(recipe, pantry) : undefined),
    [recipe, pantry, hasPantry],
  );

  if (status === 'loading') return <Loading />;
  if (!recipe) {
    return (
      <Screen>
        <EmptyState
          title="Recipe not found"
          message="It may have been deleted on another device."
          action={<Button label="Back to cookbook" onPress={() => router.replace('/')} />}
        />
      </Screen>
    );
  }

  const target = servings ?? recipe.servings;
  const factor = scaleFactor(recipe, target);
  const groups = groupIngredients(recipe.ingredients);
  const missingIds = new Set(match?.missing.map((i) => i.id) ?? []);

  const confirmDelete = () => {
    const remove = () => {
      void library.deleteRecipe(recipe.id);
      router.replace('/');
    };
    Alert.alert('Delete this recipe?', `"${recipe.title}" will be removed for everyone in the cookbook.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  };

  const edit = () => {
    setPendingDraft({ draft: recipeToDraft(recipe), editingRecipeId: recipe.id });
    router.push('/import/review');
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing.lg, paddingRight: spacing.xs }}>
              <Pressable onPress={edit} accessibilityRole="button" accessibilityLabel="Edit recipe" hitSlop={10}>
                <Ionicons name="create-outline" size={22} color={theme.text} />
              </Pressable>
              <Pressable onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="Delete recipe" hitSlop={10}>
                <Ionicons name="trash-outline" size={22} color={theme.text} />
              </Pressable>
            </View>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 }}>
        {recipe.imageUri ? (
          <Image
            source={{ uri: recipe.imageUri }}
            style={{ width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: theme.surfaceMuted }}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Heading level={1}>{recipe.title}</Heading>
          {recipe.source?.familyAttribution ? (
            <Body style={{ color: theme.accent, fontStyle: 'italic' }}>{recipe.source.familyAttribution}</Body>
          ) : null}
          {recipe.description ? <Body muted>{recipe.description}</Body> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
            {totalMinutes(recipe) ? <Chip label={formatMinutes(totalMinutes(recipe))} tone="accent" /> : null}
            {recipe.timesCooked ? <Chip label={`Cooked ${recipe.timesCooked}×`} tone="success" /> : null}
            {recipe.tags.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        </View>

        <Button
          label="Start cooking"
          onPress={() => router.push(`/cook/${recipe.id}?servings=${target}`)}
          icon={<Ionicons name="flame-outline" size={20} color={theme.onAccent} />}
        />

        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Heading level={2}>Ingredients</Heading>
            <ServingsStepper value={target} original={recipe.servings} onChange={setServings} />
          </View>

          {match && match.missing.length > 0 ? (
            <Notice tone="warning" title={`Missing ${match.missing.length}`}>
              {match.missing.map((i) => i.item).join(', ')}
            </Notice>
          ) : null}

          {groups.map((group) => (
            <View key={group.name ?? 'main'} style={{ gap: spacing.sm }}>
              {group.name ? (
                <Heading level={3} style={{ color: theme.textMuted }}>{group.name}</Heading>
              ) : null}

              {group.items.map((ingredient) => (
                <View key={ingredient.id} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                  <Ionicons
                    name={!match ? 'ellipse' : missingIds.has(ingredient.id) ? 'ellipse-outline' : 'checkmark-circle'}
                    size={match ? 18 : 7}
                    color={match && !missingIds.has(ingredient.id) ? theme.success : theme.textFaint}
                    style={{ marginTop: match ? 2 : 8 }}
                  />
                  <Body style={{ flex: 1 }}>{formatIngredient(ingredient, factor)}</Body>
                </View>
              ))}
            </View>
          ))}

          {factor !== 1 ? (
            <Body muted style={{ fontSize: 12 }}>
              Scaled from {recipe.servings} servings. Cooking times stay the same.
            </Body>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Heading level={2}>Method</Heading>
          {recipe.steps.map((step, index) => (
            <View key={step.id} style={{ flexDirection: 'row', gap: spacing.md }}>
              <Body style={{ color: theme.accent, fontWeight: '700', fontFamily: typography.display, fontSize: 18 }}>
                {index + 1}
              </Body>
              <Body style={{ flex: 1 }}>{step.text}</Body>
            </View>
          ))}
        </Card>

        {recipe.notes ? (
          <Card style={{ gap: spacing.sm, backgroundColor: theme.surfaceMuted }}>
            <Heading level={3}>Notes</Heading>
            <Body>{recipe.notes}</Body>
          </Card>
        ) : null}

        {recipe.nutrition ? (
          <Card style={{ gap: spacing.sm }}>
            <Heading level={3}>Per serving</Heading>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {nutritionRows(recipe.nutrition).map(({ label, value }) => (
                <Chip key={label} label={`${label} ${value}`} />
              ))}
            </View>
            {recipe.nutrition.basis === 'estimated' ? (
              <Body muted style={{ fontSize: 12 }}>Estimated, not measured.</Body>
            ) : null}
          </Card>
        ) : null}

        {recipe.source?.url ? (
          <>
            <Divider />
            <Body muted style={{ fontSize: 12 }}>
              From {recipe.source.siteName ?? recipe.source.url}
              {recipe.source.author ? ` · ${recipe.source.author}` : ''}
            </Body>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ServingsStepper({
  value, original, onChange,
}: { value: number; original: number; onChange: (next: number) => void }) {
  const theme = useTheme();
  const step = (delta: number) => onChange(Math.max(1, value + delta));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fewer servings">
        <Ionicons name="remove-circle-outline" size={26} color={theme.textMuted} />
      </Pressable>
      <Body style={{ minWidth: 68, textAlign: 'center' }}>
        {value} {value === 1 ? 'serving' : 'servings'}
      </Body>
      <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More servings">
        <Ionicons name="add-circle-outline" size={26} color={theme.textMuted} />
      </Pressable>
      {value !== original ? (
        <Pressable onPress={() => onChange(original)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Reset servings">
          <Ionicons name="refresh-outline" size={20} color={theme.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function groupIngredients(ingredients: Ingredient[]): { name?: string; items: Ingredient[] }[] {
  const groups: { name?: string; items: Ingredient[] }[] = [];
  for (const ingredient of ingredients) {
    const existing = groups.find((g) => g.name === ingredient.group);
    if (existing) existing.items.push(ingredient);
    else groups.push({ name: ingredient.group, items: [ingredient] });
  }
  return groups;
}

function nutritionRows(nutrition: Nutrition): { label: string; value: string }[] {
  const grams = (value: number | undefined) => (value === undefined ? undefined : `${value}g`);

  return [
    { label: 'Calories', value: nutrition.calories === undefined ? undefined : String(nutrition.calories) },
    { label: 'Protein', value: grams(nutrition.proteinG) },
    { label: 'Carbs', value: grams(nutrition.carbsG) },
    { label: 'Fat', value: grams(nutrition.fatG) },
    { label: 'Fibre', value: grams(nutrition.fiberG) },
  ].filter((row): row is { label: string; value: string } => row.value !== undefined);
}
