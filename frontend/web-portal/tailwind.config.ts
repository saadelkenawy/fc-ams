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
          600: '#B71C1C',
          700: '#991B1B',
          800: '#7F1D1D',
          900: '#450A0A',
        },
        sidebar:  '#0f172a',
        surface:  '#f8fafc',
        danger: {
          DEFAULT: '#dc2626',
          50:  '#fef2f2',
          100: '#fee2e2',
          600: '#dc2626',
          700: '#b91c1c',
        },
        accent: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
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
        '1': '0 1px 2px rgba(15,23,42,0.04)',
        '2': '0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.04)',
        '3': '0 4px 6px rgba(15,23,42,0.10), 0 10px 24px rgba(15,23,42,0.06)',
        '4': '0 4px 16px rgba(0,0,0,0.08), 0 8px 24px rgba(15,23,42,0.06)',
        '5': '0 8px 32px rgba(0,0,0,0.12), 0 16px 48px rgba(15,23,42,0.08)',
        'glow-primary': '0 0 0 4px rgba(183,28,28,0.12)',
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
        'pulse-dot':      'pulse-dot 2s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-in':        'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
