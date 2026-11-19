import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isCloudConfigured, loadStoredConnection } from '../src/config';
import { useConfig } from '../src/state/useConfig';
import { useAuth } from '../src/state/useAuth';
import { Loading } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();
  const [ready, setReady] = useState(false);

  // Whatever project this device was pointed at has to be known before any
  // screen asks whether the app is configured.
  useEffect(() => {
    void loadStoredConnection().finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {ready ? <Gate /> : <Loading />}
    </SafeAreaProvider>
  );
}

/**
 * Two things have to be true before the cookbook is reachable: the app knows
 * which project to talk to, and somebody is signed in to it. Each has its own
 * screen, and this decides which one you are looking at.
 */
function Gate() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { status } = useAuth();

  useConfig(); // re-render when a project is chosen on the connect screen
  const configured = isCloudConfigured();

  const onConnect = segments[0] === 'connect';
  const onSignIn = segments[0] === 'sign-in';

  useEffect(() => {
    if (!configured) {
      if (!onConnect) router.replace('/connect');
      return;
    }
    if (status === 'loading') return;

    if (status === 'signed-in') {
      if (onSignIn || onConnect) router.replace('/');
    } else if (!onSignIn) {
      router.replace('/sign-in');
    }
  }, [configured, status, onConnect, onSignIn, router]);

  // Hold rather than flashing the cookbook at someone who cannot see it yet.
  if (!configured && !onConnect) return <Loading />;
  if (configured && status === 'loading') return <Loading />;
  if (configured && status !== 'signed-in' && !onSignIn) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
      <Stack.Screen name="cook/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="import/index" options={{ title: 'Add a recipe', presentation: 'modal' }} />
      <Stack.Screen name="import/review" options={{ title: 'Check it over' }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ headerShown: false }} />
    </Stack>
  );
}
