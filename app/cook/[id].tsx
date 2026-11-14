import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { library, useLibrary } from '../../src/state/useLibrary';
import { formatIngredient, formatMinutes, scaleFactor } from '../../src/domain/recipe';
import type { Recipe } from '../../src/domain/types';
import { Body, Button, Chip, Heading, Loading } from '../../src/ui/components';
import { radius, spacing, typography, useTheme } from '../../src/ui/theme';

/**
 * Cook mode: one step at a time, large type, screen kept awake.
 *
 * This is the screen used with wet hands at arm's length, so it drops every
 * chrome element that is not the current step, its ingredients and its timer.
 */
export default function CookScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();
  const { status, recipes } = useLibrary();

  useKeepAwake();

  const recipe = useMemo(() => recipes.find((r) => r.id === id), [recipes, id]);
  const [index, setIndex] = useState(0);

  if (status === 'loading' || status === 'idle') return <Loading />;
  if (!recipe) {
    router.replace('/');
    return null;
  }

  const target = Number(servings) > 0 ? Number(servings) : recipe.servings;
  const factor = scaleFactor(recipe, target);
  const step = recipe.steps[index];
  const isLast = index >= recipe.steps.length - 1;
  // Roomy type on a phone, but not comically large on a desktop browser.
  const stepFontSize = Math.min(32, Math.max(22, width / 18));

  const finish = async () => {
    await library.markCooked(recipe.id);
    router.dismissAll();
    router.replace(`/recipe/${recipe.id}`);
  };

  const go = (delta: number) => {
    setIndex((current) => Math.min(recipe.steps.length - 1, Math.max(0, current + delta)));
    void Haptics.selectionAsync().catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center' }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: spacing.lg, gap: spacing.md,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close cook mode">
            <Ionicons name="close" size={26} color={theme.textMuted} />
          </Pressable>
          <Body muted numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{recipe.title}</Body>
          <Body muted>{index + 1}/{recipe.steps.length}</Body>
        </View>

        <View style={{ height: 3, backgroundColor: theme.surfaceMuted, marginHorizontal: spacing.lg, borderRadius: radius.pill }}>
          <View
            style={{
              height: 3,
              borderRadius: radius.pill,
              backgroundColor: theme.accent,
              width: `${((index + 1) / Math.max(1, recipe.steps.length)) * 100}%`,
            }}
          />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, flexGrow: 1 }}>
          <Heading
            level={1}
            style={{ fontSize: stepFontSize, lineHeight: stepFontSize * 1.35, fontFamily: typography.display }}
          >
            {step?.text ?? 'Done.'}
          </Heading>

          {step?.durationMinutes ? <Timer minutes={step.durationMinutes} key={step.id} /> : null}

          <StepIngredients recipe={recipe} stepIndex={index} factor={factor} />
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg }}>
          <Button label="Back" variant="secondary" onPress={() => go(-1)} disabled={index === 0} style={{ flex: 1 }} />
          <Button
            label={isLast ? 'Finished' : 'Next'}
            onPress={() => (isLast ? void finish() : go(1))}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * The ingredients this step mentions, so the cook does not scroll back up.
 * Matched on the food name appearing in the step text — imperfect, but it only
 * ever shows a useful reminder or nothing.
 */
function StepIngredients({
  recipe, stepIndex, factor,
}: { recipe: Recipe; stepIndex: number; factor: number }) {
  const theme = useTheme();
  const step = recipe.steps[stepIndex];

  const relevant = useMemo(() => {
    if (!step) return [];
    const text = step.text.toLowerCase();
    return recipe.ingredients.filter((ingredient) => {
      const head = ingredient.item.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 3).pop();
      return head ? text.includes(head) : false;
    });
  }, [recipe.ingredients, step]);

  if (relevant.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.lg }}>
      <Body muted style={{ fontSize: 13, fontWeight: '600' }}>For this step</Body>
      {relevant.map((ingredient) => (
        <Body key={ingredient.id} style={{ fontSize: 17 }}>{formatIngredient(ingredient, factor)}</Body>
      ))}
    </View>
  );
}

function Timer({ minutes }: { minutes: number }) {
  const theme = useTheme();
  const total = Math.round(minutes * 60);
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const deadline = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!running) return;

    // Track a wall-clock deadline: a setInterval tick drifts, and drifts badly
    // once the app is backgrounded while something is in the oven.
    deadline.current ??= Date.now() + remaining * 1000;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current! - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        deadline.current = undefined;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }, 250);

    return () => clearInterval(tick);
  }, [running, remaining]);

  const toggle = () => {
    if (running) {
      deadline.current = undefined;
      setRunning(false);
    } else {
      if (remaining === 0) setRemaining(total);
      setRunning(true);
    }
  };

  const reset = () => {
    setRunning(false);
    deadline.current = undefined;
    setRemaining(total);
  };

  const done = remaining === 0;

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
        backgroundColor: done ? theme.successSoft : theme.surfaceMuted,
        borderRadius: radius.lg, padding: spacing.lg,
      }}
    >
      <Heading
        level={1}
        style={{ fontVariant: ['tabular-nums'], color: done ? theme.success : theme.text, minWidth: 110 }}
      >
        {formatClock(remaining)}
      </Heading>

      <View style={{ flexDirection: 'row', gap: spacing.sm, flex: 1 }}>
        <Button
          label={done ? 'Done' : running ? 'Pause' : 'Start'}
          onPress={toggle}
          variant={running ? 'secondary' : 'primary'}
          disabled={done}
          style={{ flex: 1 }}
        />
        {remaining !== total ? (
          <Button label="Reset" variant="ghost" onPress={reset} />
        ) : (
          <Chip label={formatMinutes(minutes)} />
        )}
      </View>
    </View>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
