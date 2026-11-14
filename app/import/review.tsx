import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { clearPendingDraft, usePendingDraft } from '../../src/state/draftStore';
import { library, useLibrary } from '../../src/state/useLibrary';
import { useAuth } from '../../src/state/useAuth';
import { draftToRecipe } from '../../src/domain/recipe';
import type { RecipeDraft } from '../../src/domain/types';
import { Body, Button, Card, EmptyState, Field, Heading, Notice, Screen } from '../../src/ui/components';
import { spacing } from '../../src/ui/theme';

/**
 * The last look before saving.
 *
 * Every import lands here, including manual entry and editing. Ingredients and
 * steps are edited as plain text, one per line — the same form the cook wrote
 * them in — and parsed on save.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const pending = usePendingDraft();
  const { cookbooks } = useLibrary();
  const { user } = useAuth();

  const [form, setForm] = useState<FormState>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (pending) setForm(toForm(pending.draft));
  }, [pending]);

  if (!pending || !form) {
    return (
      <Screen>
        <EmptyState
          title="Nothing to review"
          message="Start an import and it will land here."
          action={<Button label="Add a recipe" onPress={() => router.replace('/import')} />}
        />
      </Screen>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    setSaving(true);
    try {
      const attribution = form.attribution.trim();
      const draft: RecipeDraft = {
        ...pending.draft,
        title: form.title,
        description: form.description || undefined,
        servings: toPositiveInt(form.servings),
        prepMinutes: toPositiveInt(form.prepMinutes),
        cookMinutes: toPositiveInt(form.cookMinutes),
        ingredientLines: splitLines(form.ingredients),
        stepTexts: splitLines(form.steps),
        notes: form.notes || undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        source: {
          method: pending.draft.source?.method ?? 'manual',
          ...pending.draft.source,
          familyAttribution: attribution || undefined,
        },
      };

      const existing = pending.editingRecipeId ? library.getRecipe(pending.editingRecipeId) : undefined;
      const cookbookId =
        existing?.cookbookId ?? cookbooks.find((c) => !c.deletedAt)?.id ?? library.defaultCookbookId();
      if (!cookbookId) {
        // The cookbook is created on the server at sign-in, so this only happens
        // if that first request has not landed yet.
        setError('Your cookbook is still opening. Try again in a moment.');
        return;
      }

      const recipe = draftToRecipe(draft, { cookbookId, createdBy: user?.id });

      // Editing keeps the recipe's identity and history; only the content changes.
      const saved = await library.saveRecipe(
        existing
          ? {
              ...recipe,
              id: existing.id,
              createdAt: existing.createdAt,
              createdBy: existing.createdBy ?? user?.id,
              timesCooked: existing.timesCooked,
              lastCookedAt: existing.lastCookedAt,
              rating: existing.rating,
              imageUri: existing.imageUri ?? recipe.imageUri,
            }
          : recipe,
      );

      clearPendingDraft();
      router.dismissAll();
      router.replace(`/recipe/${saved.id}`);
    } finally {
      setSaving(false);
    }
  };

  const confidence = pending.draft.confidence;
  const warnings = pending.draft.warnings ?? [];
  const ingredientCount = splitLines(form.ingredients).length;
  const stepCount = splitLines(form.steps).length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        {error ? <Notice tone="danger" title="Could not save">{error}</Notice> : null}

        {confidence !== undefined && confidence < 0.7 ? (
          <Notice tone="warning" title="Read this one over carefully">
            Some of this was hard to make out. Check the amounts before you save.
          </Notice>
        ) : null}

        {warnings.length > 0 ? (
          <Notice tone="warning" title="Worth checking">{warnings.join('\n')}</Notice>
        ) : null}

        {ingredientCount === 0 && stepCount === 0 ? (
          <Notice tone="danger" title="Nothing came through">
            No ingredients or steps were found. Fill them in below, or go back and try another way.
          </Notice>
        ) : null}

        <Card style={{ gap: spacing.md }}>
          <Heading level={3}>The basics</Heading>
          <Field label="Title" value={form.title} onChangeText={(v) => set('title', v)} placeholder="What is it called?" />
          <Field
            label="Who it came from"
            value={form.attribution}
            onChangeText={(v) => set('attribution', v)}
            placeholder="Grandma Ruth's recipe card"
            hint="Optional, and searchable later."
          />
          <Field
            label="Description"
            value={form.description}
            onChangeText={(v) => set('description', v)}
            placeholder="One line about it"
            multiline
            minHeight={70}
          />

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Field label="Servings" value={form.servings} onChangeText={(v) => set('servings', v)} keyboardType="numeric" style={{ flex: 1 }} />
            <Field label="Prep (min)" value={form.prepMinutes} onChangeText={(v) => set('prepMinutes', v)} keyboardType="numeric" style={{ flex: 1 }} />
            <Field label="Cook (min)" value={form.cookMinutes} onChangeText={(v) => set('cookMinutes', v)} keyboardType="numeric" style={{ flex: 1 }} />
          </View>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Heading level={3}>Ingredients</Heading>
          <Body muted>
            One per line, written however you like — "1 1/2 cups flour" or "a good handful of parsley".
            A heading line like "For the sauce:" groups the lines under it.
          </Body>
          <Field
            value={form.ingredients}
            onChangeText={(v) => set('ingredients', v)}
            multiline
            minHeight={220}
            hint={`${ingredientCount} ${ingredientCount === 1 ? 'ingredient' : 'ingredients'}`}
          />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Heading level={3}>Method</Heading>
          <Body muted>One step per line. Times mentioned in a step become a timer in cook mode.</Body>
          <Field
            value={form.steps}
            onChangeText={(v) => set('steps', v)}
            multiline
            minHeight={220}
            hint={`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`}
          />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Heading level={3}>Extras</Heading>
          <Field label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} multiline minHeight={100} />
          <Field
            label="Tags"
            value={form.tags}
            onChangeText={(v) => set('tags', v)}
            placeholder="dinner, quick, freezes well"
            hint="Comma separated."
          />
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xl }}>
          <Button
            label="Discard"
            variant="danger"
            onPress={() => {
              clearPendingDraft();
              router.back();
            }}
          />
          <Button
            label={pending.editingRecipeId ? 'Save changes' : 'Save to cookbook'}
            onPress={() => void save()}
            loading={saving}
            disabled={!form.title.trim()}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

interface FormState {
  title: string;
  attribution: string;
  description: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  ingredients: string;
  steps: string;
  notes: string;
  tags: string;
}

function toForm(draft: RecipeDraft): FormState {
  return {
    title: draft.title ?? '',
    attribution: draft.source?.familyAttribution ?? '',
    description: draft.description ?? '',
    servings: draft.servings ? String(draft.servings) : '',
    prepMinutes: draft.prepMinutes ? String(Math.round(draft.prepMinutes)) : '',
    cookMinutes: draft.cookMinutes ? String(Math.round(draft.cookMinutes)) : '',
    ingredients: draft.ingredientLines.join('\n'),
    steps: draft.stepTexts.join('\n'),
    notes: draft.notes ?? '',
    tags: (draft.tags ?? []).join(', '),
  };
}

function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function toPositiveInt(text: string): number | undefined {
  const value = parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
