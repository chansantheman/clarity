/**
 * Icon for each of the five skills. Split out from `constants/metrics.ts`
 * because these are React components (lucide-react-native) — importing one
 * drags in react-native-svg → react-native, which isn't safe under bun's
 * plain runtime. Only UI components should import this file.
 */

import { AudioWaveform, Drama, Gauge, MessageCircle, Target, type LucideIcon } from 'lucide-react-native';

import type { SkillKey } from '@/types/history';

export const SKILL_ICONS: Record<SkillKey, LucideIcon> = {
  accuracy: Target,
  fluency: AudioWaveform,
  pace: Gauge,
  fillers: MessageCircle,
  intonation: Drama,
};
