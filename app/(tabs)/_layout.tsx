import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../src/ui/theme';

/**
 * React Navigation types the tab tint as `ColorValue`, which also covers the
 * opaque numbers Android uses internally; Ionicons only takes a string.
 */
function TabIcon({
  name, color, size,
}: { name: keyof typeof Ionicons.glyphMap; color: ColorValue | undefined; size: number }) {
  return <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />;
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cookbook',
          tabBarIcon: ({ color, size }) => <TabIcon name="book-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tonight"
        options={{
          title: 'Tonight',
          tabBarIcon: ({ color, size }) => <TabIcon name="restaurant-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          tabBarIcon: ({ color, size }) => <TabIcon name="basket-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <TabIcon name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
