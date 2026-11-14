import { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { Recipe } from '../../domain/types';
import { formatMinutes, totalMinutes } from '../../domain/recipe';
import { radius, spacing, typography, useTheme } from '../theme';
import { Body, Card, Chip } from './index';

export function RecipeCard({
  recipe, onPress, footer, pending,
}: {
  recipe: Recipe;
  onPress: () => void;
  /** Extra line under the title — pantry coverage, last cooked, and so on. */
  footer?: ReactNode;
  /** Saved on this device but not yet confirmed by the server. */
  pending?: boolean;
}) {
  const theme = useTheme();
  const time = formatMinutes(totalMinutes(recipe));
  const attribution = recipe.source?.familyAttribution;

  return (
    <Card onPress={onPress} accessibilityLabel={recipe.title} style={{ padding: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        {recipe.imageUri ? (
          <Image
            source={{ uri: recipe.imageUri }}
            style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: theme.surfaceMuted }}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={{
              width: 72, height: 72, borderRadius: radius.md,
              backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: typography.display, fontSize: 26, color: theme.textFaint }}>
              {recipe.title.trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={{ color: theme.text, fontSize: 17, fontWeight: '700', fontFamily: typography.display }}
          >
            {recipe.title}
          </Text>

          <Body muted style={{ fontSize: 13 }}>
            {[attribution, time, `${recipe.servings} servings`].filter(Boolean).join(' · ')}
          </Body>

          {footer}
        </View>
      </View>

      {pending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm }}>
          <Ionicons name="cloud-upload-outline" size={14} color={theme.warning} />
          <Body style={{ fontSize: 12, color: theme.warning }}>Waiting to sync</Body>
        </View>
      ) : null}

      {recipe.tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
          {recipe.tags.slice(0, 4).map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
