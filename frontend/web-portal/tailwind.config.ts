import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        accent: {
          50:  '#FFF5F1',
          100: '#FFE4D6',
          200: '#FFC9AC',
          300: '#FFA37F',
          400: '#FF7E54',
          500: '#F0623E',
          600: '#D14E2C',
        },
        sand: {
          50:  '#FAF7F2',
          100: '#F5EFE5',
          200: '#EBE0CD',
          300: '#DCC9A8',
          400: '#C8AC81',
        },
        mint: {
          50:  '#F0FBF4',
          100: '#DCF4E2',
          500: '#34D399',
        },
      },
      fontFamily: {
        display: ['var(--font-outfit)', 'var(--font-ibm-plex-arabic)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-manrope)', 'var(--font-tajawal)', 'system-ui', 'sans-serif'],
        arabic:  ['var(--font-tajawal)', 'sans-serif'],
        mono:    ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        sm:  '6px',
        md:  '10px',
        lg:  '14px',
        xl:  '20px',
        '2xl': '28px',
      },
      boxShadow: {
        '1': '0 1px 2px rgba(127,29,29,0.04)',
        '2': '0 1px 3px rgba(127,29,29,0.08), 0 4px 12px rgba(127,29,29,0.04)',
        '3': '0 4px 6px rgba(127,29,29,0.10), 0 10px 24px rgba(127,29,29,0.06)',
        '4': '0 4px 16px rgba(0,0,0,0.08), 0 8px 24px rgba(127,29,29,0.06)',
        '5': '0 8px 32px rgba(0,0,0,0.12), 0 16px 48px rgba(127,29,29,0.08)',
        'glow-primary': '0 0 0 4px rgba(220,38,38,0.12)',
        'glow-success': '0 0 0 4px rgba(16,185,129,0.12)',
        'glow-warning': '0 0 0 4px rgba(245,158,11,0.12)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34,1.56,0.64,1)',
        snap:   'cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        'pulse-dot': {
          '0%,100%': { boxShadow: '0 0 0 0 currentColor', opacity: '1' },
          '50%':     { boxShadow: '0 0 0 6px transparent', opacity: '0.7' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot':       'pulse-dot 2s ease-in-out infinite',
        'slide-in-right':  'slide-in-right 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-in':         'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
