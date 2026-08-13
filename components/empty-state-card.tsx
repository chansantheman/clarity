import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { fonts } from '@/constants/fonts';

const THEME = {
  light: {
    glassTint: 'rgba(255,255,255,0.45)',
    solidFallback: 'rgba(255,255,255,0.96)',
    iconBg: '#F1F1F4',
    icon: '#77777E',
    title: '#111114',
    subtitle: '#77777E',
  },
  dark: {
    glassTint: 'rgba(10,10,12,0.55)',
    solidFallback: 'rgba(26,26,30,0.96)',
    iconBg: 'rgba(255,255,255,0.08)',
    icon: '#9E9EA6',
    title: '#FFFFFF',
    subtitle: '#9E9EA6',
  },
} as const;

export type EmptyStateCardProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

/** Frosted placeholder shown where a data section has nothing to display yet —
 * states plainly that there's no data rather than faking any. */
export function EmptyStateCard({ icon: Icon, title, subtitle }: EmptyStateCardProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = THEME[scheme];
  const hasGlass = isLiquidGlassAvailable();

  const body = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: theme.iconBg }]}>
        <Icon size={24} color={theme.icon} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, { color: theme.title }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: theme.subtitle }]}>{subtitle}</Text>
    </>
  );

  return hasGlass ? (
    <GlassView glassEffectStyle="regular" style={[styles.card, { backgroundColor: theme.glassTint }]}>
      {body}
    </GlassView>
  ) : (
    <View style={[styles.card, { backgroundColor: theme.solidFallback }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 260,
  },
});
