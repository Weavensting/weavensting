import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import {
  SignInError, isAppleAvailable, isGoogleAvailable, signInWithApple, signInWithGoogle,
  signInWithGoogleOnWeb,
} from '../src/auth/providers';
import { useAuth } from '../src/state/useAuth';
import { Body, Card, Heading, Loading, Notice, Screen, Button } from '../src/ui/components';
import { radius, spacing, typography, useTheme } from '../src/ui/theme';

/**
 * The way in.
 *
 * Recipes belong to a cookbook and a cookbook belongs to an account, so this
 * comes before anything else rather than being an optional extra.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const { status, error } = useAuth();

  const [busy, setBusy] = useState<'google' | 'apple' | undefined>();
  const [message, setMessage] = useState<string>();
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    void isAppleAvailable().then(setAppleReady);
  }, []);

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

  const googleReady = isGoogleAvailable() || Platform.OS === 'web';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' }}
      >
        <View style={{ gap: spacing.sm, alignItems: 'center' }}>
          <Heading level={1} style={{ fontSize: 34, fontFamily: typography.display, textAlign: 'center' }}>
            Family Cookbook
          </Heading>
          <Body muted style={{ textAlign: 'center' }}>
            Everything the family cooks, on everyone's phone.
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
          <Heading level={3}>Why an account</Heading>
          <Body muted>
            A cookbook is shared, so it has to belong to someone. Signing in is what lets your
            recipes reach the rest of the family's phones — and what keeps everyone else's out.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}
