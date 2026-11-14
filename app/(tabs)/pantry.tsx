import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { library, useLibrary } from '../../src/state/useLibrary';
import { DEFAULT_STAPLES } from '../../src/domain/pantry';
import { Body, Button, Card, Chip, EmptyState, Field, Heading, Loading, Screen } from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

/** Common things people have, offered as one-tap adds rather than typing. */
const QUICK_ADD = [
  'eggs', 'milk', 'butter', 'onion', 'garlic', 'chicken', 'ground beef', 'rice',
  'pasta', 'potatoes', 'carrots', 'canned tomatoes', 'cheese', 'yogurt', 'lemon',
  'bell pepper', 'spinach', 'black beans', 'tortillas', 'bread',
];

export default function PantryScreen() {
  const theme = useTheme();
  const { status, pantry } = useLibrary();
  const [draft, setDraft] = useState('');

  const items = useMemo(
    () => pantry.filter((item) => !item.deletedAt).sort((a, b) => a.name.localeCompare(b.name)),
    [pantry],
  );
  const stockedNames = useMemo(() => new Set(items.map((i) => i.name.toLowerCase())), [items]);

  const add = async (name: string) => {
    await library.addPantryItem(name);
    setDraft('');
  };

  if (status === 'loading' || status === 'idle') return <Loading />;

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Heading level={2}>What is in the kitchen</Heading>
            <Body muted>
              Rough is fine — "chicken" matches chicken thighs. Salt, flour, oil and other staples are
              always assumed, so there is no need to list them.
            </Body>

            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
              <Field value={draft} onChangeText={setDraft} placeholder="Add an ingredient" style={{ flex: 1 }} />
              <Button label="Add" onPress={() => void add(draft)} disabled={!draft.trim()} />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Body muted style={{ fontSize: 13 }}>Tap to add</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {QUICK_ADD.filter((name) => !stockedNames.has(name)).map((name) => (
                  <Chip key={name} label={`+ ${name}`} onPress={() => void add(name)} />
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ paddingVertical: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Body style={{ flex: 1 }}>{item.name}</Body>
              <Pressable
                onPress={() => void library.removePantryItem(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
                hitSlop={12}
              >
                <Ionicons name="close-circle-outline" size={22} color={theme.textFaint} />
              </Pressable>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            title="Pantry is empty"
            message={`Add what you actually have. Staples (${DEFAULT_STAPLES.slice(0, 4).join(', ')} and friends) are already assumed.`}
          />
        }
      />
    </Screen>
  );
}
