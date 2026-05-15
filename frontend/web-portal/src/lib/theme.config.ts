export type ThemeId = 'light' | 'dark' | 'teal' | 'high-contrast';

export interface ThemeToken {
  id: ThemeId;
  labelAr: string;
  labelEn: string;
  icon: string;
  bg: string;
  elevated: string;
  card: string;
  input: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  primaryFrom: string;
  primaryTo: string;
  gradientGlass: string;
  gradientSidebar: string;
}

export const THEMES: Record<ThemeId, ThemeToken> = {
  light: {
    id:            'light',
    labelAr:       'فاتح',
    labelEn:       'Light',
    icon:          '☀️',
    bg:            '#F9FAFB',
    elevated:      '#FFFFFF',
    card:          '#FFFFFF',
    input:         '#FFFFFF',
    border:        '#E5E7EB',
    borderStrong:  '#D1D5DB',
    textPrimary:   '#111827',
    textSecondary: '#374151',
    textTertiary:  '#6B7280',
    textDisabled:  '#9CA3AF',
    primaryFrom:   '#B71C1C',
    primaryTo:     '#991B1B',
    gradientGlass: 'linear-gradient(135deg,rgba(255,255,255,0.75) 0%,rgba(255,255,255,0.5) 100%)',
    gradientSidebar:'linear-gradient(180deg, #B71C1C 0%, #991B1B 50%, #7F1D1D 100%)',
  },
  dark: {
    id:            'dark',
    labelAr:       'داكن',
    labelEn:       'Dark',
    icon:          '🌙',
    bg:            '#0F172A',
    elevated:      '#1E293B',
    card:          '#1E293B',
    input:         '#0F172A',
    border:        '#334155',
    borderStrong:  '#475569',
    textPrimary:   '#F1F5F9',
    textSecondary: '#CBD5E1',
    textTertiary:  '#94A3B8',
    textDisabled:  '#64748B',
    primaryFrom:   '#EF4444',
    primaryTo:     '#DC2626',
    gradientGlass: 'linear-gradient(135deg,rgba(30,41,59,0.92) 0%,rgba(15,23,42,0.85) 100%)',
    gradientSidebar:'linear-gradient(180deg, #7F1D1D 0%, #450A0A 100%)',
  },
  teal: {
    id:            'teal',
    labelAr:       'تيل',
    labelEn:       'Medical Teal',
    icon:          '🩵',
    bg:            '#F0FDFA',
    elevated:      '#FFFFFF',
    card:          '#FFFFFF',
    input:         '#FFFFFF',
    border:        '#CCFBF1',
    borderStrong:  '#99F6E4',
    textPrimary:   '#134E4A',
    textSecondary: '#1F6B63',
    textTertiary:  '#4E9B8F',
    textDisabled:  '#9CA3AF',
    primaryFrom:   '#0D9488',
    primaryTo:     '#0F766E',
    gradientGlass: 'linear-gradient(135deg,rgba(255,255,255,0.8) 0%,rgba(240,253,250,0.65) 100%)',
    gradientSidebar:'#042F2E',
  },
  'high-contrast': {
    id:            'high-contrast',
    labelAr:       'تباين عالٍ',
    labelEn:       'High Contrast',
    icon:          '⚫',
    bg:            '#000000',
    elevated:      '#0A0A0A',
    card:          '#111111',
    input:         '#000000',
    border:        '#FFFFFF',
    borderStrong:  '#FFFF00',
    textPrimary:   '#FFFFFF',
    textSecondary: '#EEEEEE',
    textTertiary:  '#CCCCCC',
    textDisabled:  '#888888',
    primaryFrom:   '#FFFF00',
    primaryTo:     '#FFD700',
    gradientGlass: 'linear-gradient(135deg,rgba(0,0,0,0.95) 0%,rgba(17,17,17,0.9) 100%)',
    gradientSidebar:'#000000',
  },
};

export const THEME_ORDER: ThemeId[] = ['light', 'dark', 'teal', 'high-contrast'];
