import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { authStore } from '../src/auth/store';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();

  // Start listening for a stored session before any screen asks who is signed in.
  useEffect(() => {
    authStore.start();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
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
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
