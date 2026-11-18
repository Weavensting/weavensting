import type { ExpoConfig } from 'expo/config';

/**
 * Build-time app configuration.
 *
 * A config file rather than app.json so the Google sign-in plugin is only
 * included when its client IDs exist. Without that, an Apple-only build would
 * register a placeholder `com.googleusercontent.apps.…` URL scheme it can
 * never use.
 */

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

/**
 * Bundle identifiers are globally unique across Apple's whole developer
 * programme, so the default here is very likely taken. Set BUNDLE_ID to
 * something of your own — `com.yourname.familycookbook`.
 */
const bundleId = process.env.BUNDLE_ID?.trim() || 'com.familycookbook.app';

/**
 * The iOS URL scheme Google requires is the iOS client ID with its parts
 * reversed: `1234-abcd.apps.googleusercontent.com` becomes
 * `com.googleusercontent.apps.1234-abcd`.
 */
function reversedClientId(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

const config: ExpoConfig = {
  name: 'Family Cookbook',
  slug: 'family-cookbook',
  scheme: 'familycookbook',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // The new architecture is the only one from SDK 55; the opt-in key is gone.
  // The native splash screen moved to the expo-splash-screen plugin below.
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    // Sign in with Apple needs the capability on the build, not just the library.
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription:
        'Take a photo of a handwritten recipe card to add it to your cookbook.',
      NSPhotoLibraryUsageDescription: 'Pick a photo of a recipe to add it to your cookbook.',
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#FFF8F0',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Edge-to-edge is always on from SDK 54; the old opt-in key no longer exists.
    permissions: ['CAMERA'],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#FFF8F0',
        imageWidth: 180,
      },
    ],
    'expo-web-browser',
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: 'Pick a photo of a recipe to add it to your cookbook.',
        cameraPermission:
          'Take a photo of a handwritten recipe card to add it to your cookbook.',
        // The app never records audio — dictation is the keyboard's own
        // microphone, which needs no permission from us. Left at its default
        // this plugin would declare NSMicrophoneUsageDescription and add
        // RECORD_AUDIO to the Android manifest for a capability we do not use.
        microphonePermission: false,
      },
    ],
    // Only when Google sign-in is actually configured.
    ...(googleIosClientId
      ? [
          [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: reversedClientId(googleIosClientId) },
          ] as [string, Record<string, unknown>],
        ]
      : []),
  ],
  experiments: { typedRoutes: true },
};

export default config;
