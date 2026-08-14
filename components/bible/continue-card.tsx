import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Mic } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { ChapterState } from '@/components/bible/chapter-state';
import { fonts } from '@/constants/fonts';
import type { BibleRef } from '@/lib/bible/ref';

export type ContinueCardProps = {
  ref: BibleRef;
  title: string;
  caption: string;
  progress: number;
  onPress: (ref: BibleRef) => void;
};

export function ContinueCard({ ref, title, caption, progress, onPress }: ContinueCardProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const hasGlass = isLiquidGlassAvailable();
  const theme = scheme === 'dark'
    ? { glass: 'rgba(10,10,12,0.55)', fallback: 'rgba(26,26,30,0.96)', foreground: '#FFFFFF', secondary: '#9E9EA6', button: '#F2F2F5', buttonText: '#111114' }
    : { glass: 'rgba(255,255,255,0.45)', fallback: 'rgba(244,244,246,0.96)', foreground: '#111114', secondary: '#77777E', button: '#1C1C21', buttonText: '#FFFFFF' };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(ref);
  };

  return (
    <View style={styles.card}>
      {hasGlass ? (
        <GlassView glassEffectStyle="regular" style={[StyleSheet.absoluteFill, styles.shape, { backgroundColor: theme.glass }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.shape, { backgroundColor: theme.fallback }]} />
      )}
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: theme.secondary }]}>Continue reading</Text>
          <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
          <Text style={[styles.caption, { color: theme.secondary }]}>{caption}</Text>
        </View>
        <ChapterState progress={progress} complete={progress >= 1} />
      </View>
      <Pressable onPress={handlePress}>
        {hasGlass ? (
          <GlassView glassEffectStyle="regular" isInteractive tintColor={theme.button} style={styles.button}>
            <Mic size={20} color={theme.buttonText} fill={theme.buttonText} />
            <Text style={[styles.buttonLabel, { color: theme.buttonText }]}>Continue</Text>
          </GlassView>
        ) : (
          <View style={[styles.button, { backgroundColor: theme.button }]}>
            <Mic size={20} color={theme.buttonText} fill={theme.buttonText} />
            <Text style={[styles.buttonLabel, { color: theme.buttonText }]}>Continue</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 36, borderCurve: 'continuous' },
  shape: { borderRadius: 36, borderCurve: 'continuous' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  copy: { flex: 1 },
  eyebrow: { fontSize: 13, fontFamily: fonts.medium },
  title: { fontSize: 26, fontFamily: fonts.bold, letterSpacing: -0.4, marginTop: 2 },
  caption: { fontSize: 15, fontFamily: fonts.regular, marginTop: 4 },
  button: { height: 54, borderRadius: 27, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
  buttonLabel: { fontSize: 17, fontFamily: fonts.semibold },
});
