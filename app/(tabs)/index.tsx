import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../../src/state/useLibrary';
import { collectTags, searchRecipes, type SearchFilters } from '../../src/domain/search';
import { Body, Button, Chip, EmptyState, Field, Loading, Notice, Screen } from '../../src/ui/components';
import { RecipeCard } from '../../src/ui/components/RecipeCard';
import { spacing, useTheme } from '../../src/ui/theme';

type Sort = NonNullable<SearchFilters['sort']>;

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'title', label: 'A–Z' },
  { value: 'quickest', label: 'Quickest' },
];

export default function CookbookScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, recipes, error } = useLibrary();

  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('recent');

  const tags = useMemo(() => collectTags(recipes).slice(0, 12), [recipes]);
  const results = useMemo(
    () => searchRecipes(recipes, { query, tags: activeTags, sort: query ? 'relevance' : sort }),
    [recipes, query, activeTags, sort],
  );

  const toggleTag = (tag: string) =>
    setActiveTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  if (status === 'loading') return <Loading message="Opening your cookbook" />;

  return (
    <Screen>
      <FlatList
        data={results}
        keyExtractor={(item) => item.recipe.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
            {error ? <Notice tone="danger" title="Could not open the cookbook">{error}</Notice> : null}

            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Search recipes, ingredients, or who it came from"
            />

            {!query ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {SORTS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={sort === option.value}
                    onPress={() => setSort(option.value)}
                  />
                ))}
              </View>
            ) : null}

            {tags.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {tags.map(({ tag, count }) => (
                  <Chip
                    key={tag}
                    label={`${tag} ${count}`}
                    selected={activeTags.includes(tag)}
                    onPress={() => toggleTag(tag)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RecipeCard recipe={item.recipe} onPress={() => router.push(`/recipe/${item.recipe.id}`)} />
        )}
        ListEmptyComponent={
          recipes.filter((r) => !r.deletedAt).length === 0 ? (
            <EmptyState
              title="Your cookbook is empty"
              message="Add the first recipe from a link, a photo of a handwritten card, or by dictating it."
              action={<Button label="Add a recipe" onPress={() => router.push('/import')} />}
            />
          ) : (
            <EmptyState
              title="Nothing matches"
              message="Try a different word, or clear the filters."
              action={
                <Button
                  label="Clear filters"
                  variant="secondary"
                  onPress={() => {
                    setQuery('');
                    setActiveTags([]);
                  }}
                />
              }
            />
          )
        }
      />

      <Button
        label="Add recipe"
        onPress={() => router.push('/import')}
        icon={<Ionicons name="add" size={20} color={theme.onAccent} />}
        style={{
          position: 'absolute',
          right: spacing.lg,
          bottom: spacing.lg,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      />

      {results.length > 0 ? (
        <View style={{ position: 'absolute', left: spacing.lg, bottom: spacing.lg + 14 }}>
          <Body muted style={{ fontSize: 12 }}>
            {results.length} {results.length === 1 ? 'recipe' : 'recipes'}
          </Body>
        </View>
      ) : null}
    </Screen>
  );
}
