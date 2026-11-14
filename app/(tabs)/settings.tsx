import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isCloudConfigured, isGoogleConfigured } from '../../src/config';
import { sync, type SyncResult } from '../../src/data/sync';
import { signOutEverywhere } from '../../src/auth/providers';
import { displayName } from '../../src/auth/store';
import { useAuth } from '../../src/state/useAuth';
import { useLibrary } from '../../src/state/useLibrary';
import { Body, Button, Card, Divider, Heading, Notice, Screen } from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { recipes, pantry, cookbooks } = useLibrary();
  const { status, user } = useAuth();

  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult>();

  const liveRecipes = recipes.filter((r) => !r.deletedAt).length;

  const runSync = async () => {
    setSyncing(true);
    try {
      setResult(await sync());
    } finally {
      setSyncing(false);
    }
  };

  const confirmSignOut = () => {
    const out = () => {
      void signOutEverywhere();
      setResult(undefined);
    };
    Alert.alert(
      'Sign out?',
      'Your recipes stay on this device. You will stop receiving the family’s changes until you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: out },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card style={{ gap: spacing.md }}>
          <Heading level={3}>Account</Heading>

          {status === 'signed-in' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Ionicons name="person-circle-outline" size={36} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{displayName(user)}</Body>
                  {user?.email ? (
                    <Body muted numberOfLines={1} style={{ fontSize: 13 }}>{user.email}</Body>
                  ) : null}
                </View>
              </View>
              <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
            </>
          ) : status === 'unavailable' ? (
            <>
              <Body muted>
                Accounts need a Supabase project. Add the URL and anon key to .env and restart — see
                docs/setup.md. Everything else works without one.
              </Body>
            </>
          ) : (
            <>
              <Body muted>
                Signed out. The cookbook works fine like this — signing in syncs it with the family
                and turns on photo and dictation import.
              </Body>
              <Button label="Sign in" onPress={() => router.push('/sign-in')} />
              {!isGoogleConfigured && isCloudConfigured ? (
                <Body muted style={{ fontSize: 12 }}>
                  Google sign-in also needs its client IDs in .env.
                  {Platform.OS === 'ios' ? ' Sign in with Apple works without them.' : ''}
                </Body>
              ) : null}
            </>
          )}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading level={3}>This device</Heading>
          <Body muted>
            {liveRecipes} {liveRecipes === 1 ? 'recipe' : 'recipes'} in {cookbooks.length}{' '}
            {cookbooks.length === 1 ? 'cookbook' : 'cookbooks'} ·{' '}
            {pantry.filter((p) => !p.deletedAt).length} pantry items
          </Body>
          <Body muted>
            Everything is stored on this device and works with no signal. Sharing with the family is
            what the cloud adds.
          </Body>
        </Card>

        {status === 'signed-in' ? (
          <Card style={{ gap: spacing.md }}>
            <Heading level={3}>Family sharing</Heading>
            <Body muted>Sync pushes your changes up and pulls in what everyone else added.</Body>
            <Button label="Sync now" onPress={() => void runSync()} loading={syncing} />
            {result ? (
              <Notice tone={result.status === 'error' ? 'danger' : 'success'}>
                {result.status === 'error'
                  ? result.error ?? 'Sync failed.'
                  : result.status === 'signed-out'
                    ? 'Sign in to sync with the family.'
                    : `Sent ${result.pushed}, received ${result.pulled}.`}
              </Notice>
            ) : null}
          </Card>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <Heading level={3}>How importing works</Heading>
          <Body muted>
            Recipe links are read straight from the page's own markup — instant, exact, and free.
          </Body>
          <Divider />
          <Body muted>
            Photos of handwritten cards, dictated recipes and video descriptions go through the
            recipe reader on your own server, so your Claude API key never ships inside the app.
          </Body>
        </Card>

        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Body muted style={{ fontSize: 12 }}>Family Cookbook 0.1.0</Body>
        </View>
      </ScrollView>
    </Screen>
  );
}
