import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import {
  SignInError, isAppleAvailable, isGoogleAvailable, signInWithApple, signInWithGoogle,
  signInWithGoogleOnWeb,
} from '../src/auth/providers';
import { useAuth } from '../src/state/useAuth';
import { useLibrary } from '../src/state/useLibrary';
import { Body, Button, Card, Heading, Loading, Notice, Screen } from '../src/ui/components';
import { radius, spacing, useTheme } from '../src/ui/theme';

/**
 * Sign-in is optional and the screen says so.
 *
 * The cookbook already works on this device. An account adds two things:
 * syncing with the family, and the import paths that need a server. Anything
 * already saved comes along — `claimLocalDataFor` hands it to the new account.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, error } = useAuth();
  const { recipes } = useLibrary();

  const [busy, setBusy] = useState<'google' | 'apple' | undefined>();
  const [message, setMessage] = useState<string>();
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    void isAppleAvailable().then(setAppleReady);
  }, []);

  useEffect(() => {
    // Leave as soon as the session lands, however it arrived.
    if (status === 'signed-in') router.back();
  }, [status, router]);

  const run = async (provider: 'google' | 'apple') => {
    setMessage(undefined);
    setBusy(provider);
    try {
      if (provider === 'apple') await signInWithApple();
      else if (Platform.OS === 'web') await signInWithGoogleOnWeb();
      else await signInWithGoogle();
    } catch (caught) {
      // Backing out of the system sheet is not an error worth shouting about.
      if (caught instanceof SignInError && caught.code === 'cancelled') return;
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  };

  if (status === 'loading') return <Loading />;

  if (status === 'unavailable') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <Heading level={1}>Accounts are not set up</Heading>
          <Notice tone="warning" title="Needs a Supabase project">
            Family sharing and photo import run through your own backend. Add the Supabase URL and
            anon key to .env, then restart — see docs/setup.md. Everything else works without it.
          </Notice>
          <Button label="Back to the cookbook" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  const localCount = recipes.filter((r) => !r.deletedAt).length;
  const googleReady = isGoogleAvailable() || Platform.OS === 'web';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}>
        <View style={{ gap: spacing.sm, paddingTop: spacing.lg }}>
          <Heading level={1}>Share the cookbook</Heading>
          <Body muted>
            Signing in syncs your recipes across everyone's phones and turns on reading recipes from
            photos, dictation and videos.
          </Body>
        </View>

        {message ? <Notice tone="danger" title="That did not work">{message}</Notice> : null}
        {error && !message ? <Notice tone="danger">{error}</Notice> : null}

        <View style={{ gap: spacing.md }}>
          {appleReady ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                theme.isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.md}
              style={{ height: 50, width: '100%' }}
              onPress={() => void run('apple')}
            />
          ) : null}

          {googleReady && Platform.OS !== 'web' ? (
            <GoogleSigninButton
              size={GoogleSigninButton.Size.Wide}
              color={theme.isDark ? GoogleSigninButton.Color.Dark : GoogleSigninButton.Color.Light}
              onPress={() => void run('google')}
              disabled={busy !== undefined}
              style={{ width: '100%', height: 50 }}
            />
          ) : null}

          {Platform.OS === 'web' ? (
            <Button
              label="Continue with Google"
              onPress={() => void run('google')}
              loading={busy === 'google'}
            />
          ) : null}

          {!googleReady && !appleReady ? (
            <Notice tone="warning" title="No sign-in method is configured">
              Add your Google client IDs to .env to enable Google sign-in. Sign in with Apple needs
              an iOS build — it is not available on this platform.
            </Notice>
          ) : null}
        </View>

        <Card style={{ gap: spacing.sm, backgroundColor: theme.surfaceMuted }}>
          <Heading level={3}>Nothing is lost</Heading>
          <Body muted>
            {localCount > 0
              ? `The ${localCount} ${localCount === 1 ? 'recipe' : 'recipes'} already on this device become yours and sync up on your first sync.`
              : 'Recipes you add before signing in become yours automatically.'}
          </Body>
        </Card>

        <Button label="Not now" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
