import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { SegmentedControl } from '@/components/segmented-control';
import { palette } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { useMarkInteractive } from '@/hooks/use-mark-interactive';
import { tokenizePassage } from '@/lib/passage-text';
import { addPassage } from '@/services/user-passages';

const MIN_WORDS = 20;

const PACE_OPTIONS = [
  { label: 'Slow', wpm: 120 },
  { label: 'Natural', wpm: 150 },
  { label: 'Brisk', wpm: 175 },
] as const;

/** Button treatment matching DailyGoalCard's Start Practicing CTA. */
const THEME = {
  light: {
    secondary: '#77777E',
    divider: 'rgba(17,17,20,0.10)',
    buttonTint: '#1C1C21',
    buttonSolid: '#1C1C21',
    buttonLabel: '#FFFFFF',
    buttonDisabled: 'rgba(17,17,20,0.18)',
    buttonDisabledLabel: 'rgba(255,255,255,0.85)',
    error: '#FF3B30',
  },
  dark: {
    secondary: '#9E9EA6',
    divider: 'rgba(255,255,255,0.12)',
    buttonTint: '#F2F2F5',
    buttonSolid: '#F2F2F5',
    buttonLabel: '#111114',
    buttonDisabled: 'rgba(255,255,255,0.14)',
    buttonDisabledLabel: 'rgba(17,17,20,0.6)',
    error: '#FF453A',
  },
} as const;

/** Flat card surface — glass is reserved for the save CTA, matching how the
 * rest of the app keeps solid cards for content and glass for chrome. */
function EditorCard({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = palette[scheme];

  return <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>;
}

/** Modal for adding a user passage: title, pasted text, target pace. The
 * screen title and close button live in the native stack toolbar. */
export default function PassageEditorScreen() {
  useMarkInteractive();

  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = palette[scheme];
  const theme = THEME[scheme];
  const hasGlass = isLiquidGlassAvailable();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [paceIndex, setPaceIndex] = useState(1);
  const [saveError, setSaveError] = useState<string | null>(null);

  const wordCount = useMemo(() => tokenizePassage(text).words.length, [text]);
  const targetWpm = PACE_OPTIONS[paceIndex].wpm;
  const minutes = wordCount > 0 ? Math.max(1, Math.round(wordCount / targetWpm)) : 0;
  const canSave = title.trim().length > 0 && wordCount >= MIN_WORDS;

  const handleClose = () => {
    Haptics.selectionAsync();
    router.back();
  };

  /**
   * `addPassage` returns null when the write could not be verified, and in that
   * case the passage is in neither the store nor the in-memory list. Dismissing
   * anyway would drop the user back into a library without the passage they just
   * typed, with no indication anything went wrong — so stay put and say so.
   */
  const handleSave = () => {
    if (!canSave) return;
    const saved = addPassage({ title, text, targetWpm });
    if (!saved) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSaveError("Couldn't save this passage. Your device may be out of storage.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const preview =
    wordCount === 0
      ? `At least ${MIN_WORDS} words to save`
      : wordCount < MIN_WORDS
        ? `${wordCount} of ${MIN_WORDS} words needed`
        : `${wordCount} words · ~${minutes} min${minutes > 1 ? 's' : ''} at ${targetWpm} wpm`;

  const buttonContent = (
    <>
      <BookOpen
        size={22}
        color={canSave ? theme.buttonLabel : theme.buttonDisabledLabel}
        fill={canSave ? theme.buttonLabel : theme.buttonDisabledLabel}
      />
      <Text
        style={[
          styles.saveLabel,
          { color: canSave ? theme.buttonLabel : theme.buttonDisabledLabel },
        ]}>
        Save to Library
      </Text>
    </>
  );

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <EditorCard>
          <Text style={[styles.caption, { color: theme.secondary }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setSaveError(null);
            }}
            placeholder="My speech"
            placeholderTextColor={theme.secondary}
            maxLength={48}
            style={[styles.titleInput, { color: colors.foreground }]}
          />
        </EditorCard>

        <EditorCard>
          <Text style={[styles.caption, { color: theme.secondary }]}>Your words</Text>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              setSaveError(null);
            }}
            placeholder="Paste any text, speech, or transcript…"
            placeholderTextColor={theme.secondary}
            multiline
            textAlignVertical="top"
            style={[styles.textInput, { color: colors.foreground }]}
          />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <Text style={[styles.meta, { color: saveError ? theme.error : theme.secondary }]}>
            {saveError ?? preview}
          </Text>
        </EditorCard>

        <EditorCard>
          <Text style={[styles.caption, { color: theme.secondary }]}>Reading pace</Text>
          {/* Matches the caption→input visual gap: the text inputs add ~4pt
              of their own leading below the caption's 6pt margin. */}
          <SegmentedControl
            segments={PACE_OPTIONS.map((o) => o.label)}
            selectedIndex={paceIndex}
            onChange={(index) => {
              Haptics.selectionAsync();
              setPaceIndex(index);
            }}
            style={styles.paceControl}
          />
        </EditorCard>

        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={({ pressed }) => pressed && { opacity: 0.85 }}>
          {hasGlass && canSave ? (
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              tintColor={theme.buttonTint}
              style={styles.save}>
              {buttonContent}
            </GlassView>
          ) : (
            <View
              style={[
                styles.save,
                { backgroundColor: canSave ? theme.buttonSolid : theme.buttonDisabled },
              ]}>
              {buttonContent}
            </View>
          )}
        </Pressable>
      </ScrollView>

      {/* Custom title on the LEFT of the header bar (iOS centers regular
          titles), vertically centered via the fixed-size toolbar view.
          hidesSharedBackground drops the iOS 26 glass capsule behind it. */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <View style={styles.headerTitleBox}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              New Passage
            </Text>
          </View>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="xmark" onPress={handleClose} />
      </Stack.Toolbar>
    </>
  );
}

const styles = StyleSheet.create({
  // Toolbar views need one child with explicit width/height; centering
  // vertically inside it keeps the text on the bar's middle line.
  headerTitleBox: {
    width: 200,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 21,
    fontFamily: fonts.semibold,
    letterSpacing: -0.3,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 14,
  },
  card: {
    padding: 18,
    borderRadius: 26,
    borderCurve: 'continuous',
  },
  caption: {
    fontSize: 13,
    fontFamily: fonts.medium,
    marginBottom: 6,
  },
  paceControl: {
    marginTop: 4,
  },
  titleInput: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    letterSpacing: -0.3,
    paddingVertical: 2,
  },
  textInput: {
    fontSize: 17,
    fontFamily: fonts.regular,
    lineHeight: 24,
    minHeight: 150,
    maxHeight: 260,
    paddingTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 12,
    marginBottom: 10,
  },
  meta: {
    fontSize: 13,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
  },
  save: {
    height: 60,
    borderRadius: 30,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  saveLabel: {
    fontSize: 18,
    fontFamily: fonts.semibold,
  },
});
