export const Colors = {
  primary: '#FF5500',
  primaryLight: 'rgba(255,85,0,0.12)',

  light: {
    background: '#F2F2F7',
    card: '#FFFFFF',
    text: '#000000',
    textSecondary: '#3C3C43',
    textMuted: '#8E8E93',
    border: '#C6C6C8',
    separator: '#E5E5EA',
    tabBar: '#F2F2F7',
    header: '#F2F2F7',
    success: '#34C759',
    destructive: '#FF3B30',
  },
  dark: {
    background: '#000000',
    card: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.85)',
    textMuted: '#8E8E93',
    border: '#38383A',
    separator: '#38383A',
    tabBar: '#1C1C1E',
    header: '#1C1C1E',
    success: '#30D158',
    destructive: '#FF453A',
  },
} as const;

export type ColorScheme = keyof typeof Colors.light;
