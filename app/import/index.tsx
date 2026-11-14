import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { setPendingDraft } from '../../src/state/draftStore';
import { importFromPhotos, importFromText, importFromUrl } from '../../src/import/importRecipe';
import { isExtractionConfigured, type ImageInput } from '../../src/import/extractClient';
import type { RecipeDraft } from '../../src/domain/types';
import { Body, Button, Card, Field, Heading, Loading, Notice, Screen } from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

type Mode = 'link' | 'photo' | 'dictate' | 'type';

/**
 * The front door for getting a recipe in.
 *
 * Every path ends at the same review screen, so whatever the source, the cook
 * gets a last look before anything is saved.
 */
export default function ImportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string>();

  const aiReady = isExtractionConfigured();

  const run = async (work: () => Promise<RecipeDraft>, message: string) => {
    setError(undefined);
    setBusy(message);
    try {
      setPendingDraft({ draft: await work() });
      router.replace('/import/review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  };

  const pasteLink = async () => {
    const clip = await Clipboard.getStringAsync().catch(() => '');
    if (clip) setUrl(clip.trim());
  };

  const pickPhotos = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        source === 'camera'
          ? 'Camera access is needed to photograph a recipe card.'
          : 'Photo access is needed to pick a recipe photo.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      base64: true,
      // Recipe cards stay legible well under full resolution, and smaller
      // images mean a faster, cheaper read.
      quality: 0.7,
      allowsMultipleSelection: source === 'library',
      selectionLimit: 8,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled) return;

    const images: ImageInput[] = result.assets
      .filter((asset) => asset.base64)
      .map((asset) => ({ base64: asset.base64!, mediaType: mediaTypeFor(asset.mimeType) }));

    if (images.length === 0) {
      setError('Could not read those photos. Try again.');
      return;
    }

    await run(
      () => importFromPhotos(images),
      `Reading ${images.length > 1 ? `${images.length} photos` : 'the photo'}`,
    );
  };

  if (busy) return <Loading message={busy} />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <ModeButton mode="link" current={mode} onPress={setMode} icon="link-outline" label="Link" />
          <ModeButton mode="photo" current={mode} onPress={setMode} icon="camera-outline" label="Photo" />
          <ModeButton mode="dictate" current={mode} onPress={setMode} icon="mic-outline" label="Dictate" />
          <ModeButton mode="type" current={mode} onPress={setMode} icon="create-outline" label="Type" />
        </View>

        {error ? <Notice tone="danger" title="That did not work">{error}</Notice> : null}

        {mode === 'link' ? (
          <Card style={{ gap: spacing.md }}>
            <Heading level={3}>From a link</Heading>
            <Body muted>
              A Pinterest pin, a recipe blog, or a YouTube cooking video. Most recipe sites are read
              exactly and instantly from the page itself.
            </Body>
            <Field value={url} onChangeText={setUrl} placeholder="https://" keyboardType="url" autoFocus={Platform.OS === 'web'} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Paste" variant="secondary" onPress={() => void pasteLink()} />
              <Button
                label="Import"
                onPress={() => void run(() => importFromUrl(url), 'Reading the recipe')}
                disabled={!url.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : null}

        {mode === 'photo' ? (
          <Card style={{ gap: spacing.md }}>
            <Heading level={3}>From a photo</Heading>
            <Body muted>
              A handwritten recipe card, a page from a cookbook, or a screenshot. Add several photos
              if the recipe runs over more than one.
            </Body>
            {!aiReady ? <SetupNotice /> : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {Platform.OS !== 'web' ? (
                <Button label="Take photo" onPress={() => void pickPhotos('camera')} disabled={!aiReady} style={{ flex: 1 }} />
              ) : null}
              <Button
                label="Choose photos"
                variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
                onPress={() => void pickPhotos('library')}
                disabled={!aiReady}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : null}

        {mode === 'dictate' ? (
          <Card style={{ gap: spacing.md }}>
            <Heading level={3}>Say it out loud</Heading>
            <Body muted>
              Tap the microphone on your keyboard and talk it through — ingredients, then steps.
              Ramble freely; it gets sorted out for you. Great for recording a recipe over the phone
              with a relative.
            </Body>
            {!aiReady ? <SetupNotice /> : null}
            <Field
              value={text}
              onChangeText={setText}
              placeholder="Grandma's cornbread. You need a cup and a half of cornmeal, half a cup of flour…"
              multiline
              minHeight={200}
            />
            <Button
              label="Make it a recipe"
              onPress={() => void run(() => importFromText(text, 'voice'), 'Turning this into a recipe')}
              disabled={!aiReady || text.trim().length < 20}
            />
          </Card>
        ) : null}

        {mode === 'type' ? (
          <Card style={{ gap: spacing.md }}>
            <Heading level={3}>Paste or type it</Heading>
            <Body muted>
              Paste a recipe from a message or an email, or type it out. A rough list is fine.
            </Body>
            {!aiReady ? <SetupNotice /> : null}
            <Field value={text} onChangeText={setText} placeholder="Paste the recipe here" multiline minHeight={200} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Make it a recipe"
                onPress={() => void run(() => importFromText(text, 'text'), 'Turning this into a recipe')}
                disabled={!aiReady || text.trim().length < 20}
                style={{ flex: 1 }}
              />
              <Button
                label="Enter by hand"
                variant="secondary"
                onPress={() => {
                  setPendingDraft({ draft: { ingredientLines: [], stepTexts: [], source: { method: 'manual' } } });
                  router.replace('/import/review');
                }}
              />
            </View>
          </Card>
        ) : null}

        <Body muted style={{ fontSize: 12, textAlign: 'center', color: theme.textFaint }}>
          Nothing is saved until you have looked it over.
        </Body>
      </ScrollView>
    </Screen>
  );
}

function SetupNotice() {
  return (
    <Notice tone="warning" title="Needs setting up">
      Reading photos and dictation runs through your own server. Connect a Supabase project (see
      docs/setup.md) to switch it on. Link import and entering recipes by hand work without it.
    </Notice>
  );
}

function ModeButton({
  mode, current, onPress, icon, label,
}: {
  mode: Mode;
  current: Mode;
  onPress: (mode: Mode) => void;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const theme = useTheme();
  const selected = mode === current;
  return (
    <Button
      label={label}
      variant={selected ? 'primary' : 'secondary'}
      onPress={() => onPress(mode)}
      icon={<Ionicons name={icon} size={18} color={selected ? theme.onAccent : theme.text} />}
      style={{ flexGrow: 1, flexBasis: 140 }}
    />
  );
}

function mediaTypeFor(mimeType: string | undefined): ImageInput['mediaType'] {
  switch (mimeType) {
    case 'image/png': return 'image/png';
    case 'image/webp': return 'image/webp';
    case 'image/gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}
