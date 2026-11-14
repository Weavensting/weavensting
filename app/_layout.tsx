import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '../src/state/useAuth';
import { Loading } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <AuthGate />
    </SafeAreaProvider>
  );
}

/**
 * The cookbook is a shared database, so every screen behind it needs to know
 * whose it is. Anyone not signed in is sent to the sign-in screen, and anyone
 * who is gets sent back out of it.
 */
function AuthGate() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { status } = useAuth();

  const onSignIn = segments[0] === 'sign-in';

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'signed-in' && onSignIn) router.replace('/');
    else if (status !== 'signed-in' && !onSignIn) router.replace('/sign-in');
  }, [status, onSignIn, router]);

  // Hold the splash rather than flashing the cookbook at someone signed out.
  if (status === 'loading') return <Loading />;
  if (status !== 'signed-in' && !onSignIn) return <Loading />;

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
    </Stack>
  );
}
