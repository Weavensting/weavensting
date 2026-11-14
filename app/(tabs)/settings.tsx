import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isCloudConfigured, isGoogleConfigured } from '../../src/config';
import { signOutEverywhere } from '../../src/auth/providers';
import { displayName } from '../../src/auth/store';
import { library } from '../../src/data/repository';
import { useAuth } from '../../src/state/useAuth';
import { useLibrary } from '../../src/state/useLibrary';
import { Body, Button, Card, Divider, Heading, Notice, Screen } from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const { recipes, pantry, cookbooks, online, pending, error } = useLibrary();
  const { status, user } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string>();

  const liveRecipes = recipes.filter((r) => !r.deletedAt).length;

  const refresh = async () => {
    setRefreshing(true);
    setMessage(undefined);
    try {
      await library.refresh();
      const after = library.getSnapshot();
      setMessage(
        after.online
          ? 'Up to date with the family.'
          : `Still offline${after.pending > 0 ? `, ${after.pending} change${after.pending === 1 ? '' : 's'} waiting` : ''}.`,
      );
    } finally {
      setRefreshing(false);
    }
  };

  const confirmSignOut = () => {
    const out = () => void signOutEverywhere();
    const warning =
      pending > 0
        ? `${pending} change${pending === 1 ? '' : 's'} have not reached the server yet and will be lost. Sign out anyway?`
        : 'Your cookbook stays on the server. This device will stop showing it until you sign back in.';

    Alert.alert('Sign out?', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: out },
    ]);
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
          ) : (
            <Body muted>
              Not signed in.
              {!isGoogleConfigured && isCloudConfigured
                ? ' Google sign-in also needs its client IDs in .env.'
                : ''}
              {Platform.OS === 'ios' ? ' Sign in with Apple works without them.' : ''}
            </Body>
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Heading level={3}>Your cookbook</Heading>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons
              name={online ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={20}
              color={online ? theme.success : theme.warning}
            />
            <Body muted style={{ flex: 1 }}>
              {online
                ? 'In sync with the family.'
                : pending > 0
                  ? `Offline. ${pending} change${pending === 1 ? '' : 's'} will go up when you reconnect.`
                  : 'Offline. Showing the last copy from this device.'}
            </Body>
          </View>

          <Body muted>
            {liveRecipes} {liveRecipes === 1 ? 'recipe' : 'recipes'} in {cookbooks.length}{' '}
            {cookbooks.length === 1 ? 'cookbook' : 'cookbooks'} ·{' '}
            {pantry.filter((p) => !p.deletedAt).length} pantry items
          </Body>

          <Button label="Refresh" variant="secondary" onPress={() => void refresh()} loading={refreshing} />
          {message ? <Notice tone={online ? 'success' : 'warning'}>{message}</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading level={3}>Where your recipes live</Heading>
          <Body muted>
            On the server, shared with everyone in the cookbook — one copy, so an edit on one phone
            is the same edit everywhere.
          </Body>
          <Divider />
          <Body muted>
            This device keeps a copy so the app opens instantly and a recipe stays readable with no
            signal. Anything you change offline goes up when you reconnect.
          </Body>
        </Card>

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
