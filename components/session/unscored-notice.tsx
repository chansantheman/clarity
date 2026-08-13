import { MicOff } from 'lucide-react-native';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { fonts } from '@/constants/fonts';
import { metricColors } from '@/constants/metrics';

export type UnscoredNoticeProps = {
  title: string;
  detail: string;
};

/**
 * Stands in for the score gauge when a session has no score: nothing was heard,
 * or it fell below the scoring floor.
 *
 * Deliberately not a zero. A confident `0 /100` reads as "you were terrible"
 * when the truth is "we couldn't measure this", and the second sentence is what
 * keeps the user from thinking their practice time was thrown away.
 */
export function UnscoredNotice({ title, detail }: UnscoredNoticeProps) {
  const theme = useColorScheme() === 'dark' ? metricColors.dark : metricColors.light;

  return (
    <View style={styles.container}>
      <View style={[styles.iconTile, { backgroundColor: theme.iconTile }]}>
        <MicOff size={26} color={theme.label} strokeWidth={1.5} />
      </View>
      <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.detail, { color: theme.caption }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  detail: {
    fontSize: 15,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 21,
  },
});
