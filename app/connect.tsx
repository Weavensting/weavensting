import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import {
  saveConnection, testConnection, validateConnection, type ConnectionProblem,
} from '../src/config';
import { Body, Button, Card, Field, Heading, Notice, Screen } from '../src/ui/components';
import { spacing, typography, useTheme } from '../src/ui/theme';

/**
 * Point this install at a Supabase project.
 *
 * A build can ship without one — `EXPO_PUBLIC_SUPABASE_URL` and the anon key
 * are optional — so the app can be installed before the backend exists and
 * pointed at it later, without rebuilding. A build that *was* given a project
 * never reaches this screen.
 *
 * Neither value is a secret. The anon key is meant to be in the app; row-level
 * security is what protects the data.
 */
export default function ConnectScreen() {
  const theme = useTheme();

  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [problems, setProblems] = useState<ConnectionProblem[]>([]);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);

  const problemFor = (field: 'url' | 'key') => problems.find((p) => p.field === field)?.message;

  const pasteInto = async (set: (value: string) => void) => {
    const clip = await Clipboard.getStringAsync().catch(() => '');
    if (clip) set(clip.trim());
  };

  const connect = async () => {
    setFailure(undefined);

    const found = validateConnection(url, key);
    setProblems(found);
    if (found.length > 0) return;

    setBusy(true);
    try {
      // Check it really works now, rather than failing mysteriously at sign-in.
      const result = await testConnection(url, key);
      if (!result.ok) {
        setFailure(result.message);
        return;
      }
      await saveConnection({ supabaseUrl: url, supabaseAnonKey: key });
      // The gate in _layout.tsx moves on by itself once a project is known.
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.sm, paddingTop: spacing.xl }}>
          <Heading level={1} style={{ fontFamily: typography.display }}>Connect your cookbook</Heading>
          <Body muted>
            Recipes live in a Supabase project that you own. Paste its details here and this phone
            will use it — you only do this once per install.
          </Body>
        </View>

        {failure ? <Notice tone="danger" title="Could not connect">{failure}</Notice> : null}

        <Card style={{ gap: spacing.md }}>
          <Field
            label="Project URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://yourproject.supabase.co"
            keyboardType="url"
            hint={problemFor('url') ?? 'Supabase dashboard → Settings → API → Project URL'}
          />
          <Button label="Paste URL" variant="secondary" onPress={() => void pasteInto(setUrl)} />

          <Field
            label="Anon public key"
            value={key}
            onChangeText={setKey}
            placeholder="eyJhbGciOi…"
            multiline
            minHeight={90}
            hint={problemFor('key') ?? 'The same page, under Project API keys. The long one marked anon public.'}
          />
          <Button label="Paste key" variant="secondary" onPress={() => void pasteInto(setKey)} />
        </Card>

        <Button
          label={busy ? 'Checking…' : 'Connect'}
          onPress={() => void connect()}
          loading={busy}
          disabled={!url.trim() || !key.trim()}
        />

        <Card style={{ gap: spacing.sm, backgroundColor: theme.surfaceMuted }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="information-circle-outline" size={18} color={theme.textMuted} />
            <Heading level={3}>Which key?</Heading>
          </View>
          <Body muted>
            The <Body style={{ fontWeight: '700' }}>anon public</Body> one. It is designed to live
            inside apps — what protects your recipes is row-level security on the project, not
            keeping that key quiet.
          </Body>
          <Body muted>
            Never paste the <Body style={{ fontWeight: '700' }}>service_role</Body> key here. It
            bypasses every security rule. This screen checks and will refuse it.
          </Body>
        </Card>

        <Button
          label="I have not made a project yet"
          variant="ghost"
          onPress={() => void Linking.openURL('https://supabase.com/dashboard')}
        />
      </ScrollView>
    </Screen>
  );
}
