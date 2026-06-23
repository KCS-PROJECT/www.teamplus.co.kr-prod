import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ice: {
          50: '#EEF4FF',
          100: '#DBE6FF',
          200: '#B8CCFF',
          300: '#85A8FF',
          400: '#5A82FF',
          500: '#2F5FFF',
          600: '#1F47E6',
          700: '#1837B8',
          800: '#0F1F57',
          900: '#0A153D',
          950: '#050A20',
        },
        accent: {
          cyan: '#22D3EE',
          violet: '#8B5CF6',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
        },
        surface: {
          DEFAULT: '#F6F8FC',
          raised: '#FFFFFF',
          overlay: '#EEF1F7',
        },
        rink: {
          50: '#F5F7FB',
          100: '#E5E9F2',
          300: '#9AA4BA',
          500: '#6B7588',
          700: '#2A3247',
          800: '#1F2536',
          900: '#141826',
          puck: '#0A0D14',
        },
        wbg: '#F6F8FC',
        wsurface: '#FFFFFF',
        wline: '#E5E9F2',
        wtext: {
          1: '#0A0D14',
          2: '#2A3247',
          3: '#56607E', // WCAG AA 본문 5.36:1 보강 (이전 #6B7588 = 4.36 미달)
          4: '#677087', // WCAG AA 4.65:1(wbg)/4.95:1(white) — 소형 캡션 가독성 확보 (이전 #7D8699 = 3.4:1 미달)
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Pretendard', 'system-ui', 'sans-serif'],
        num: ['Pretendard', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['clamp(3rem, 7vw, 7rem)', { lineHeight: '0.95', letterSpacing: '0' }],
        'display-xl': ['clamp(2.5rem, 5.5vw, 5rem)', { lineHeight: '1', letterSpacing: '0' }],
        'display-lg': ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '0' }],
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(to right, rgb(229 233 242 / 0.7) 1px, transparent 1px), linear-gradient(to bottom, rgb(229 233 242 / 0.7) 1px, transparent 1px)',
      },
      animation: {
        'fade-up': 'fade-up 0.8s ease-out forwards',
        'fade-in': 'fade-in 0.8s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'marquee': 'marquee 40s linear infinite',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
