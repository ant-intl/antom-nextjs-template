import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        antom: {
          primary: '#1677FF',
          dark: '#0958D9',
          accent: '#FAAD14',
        },
        // Near-black primary action color (Apple/Stripe minimal direction).
        ink: {
          DEFAULT: '#0A0A0A',
          soft: '#1A1A1A',
        },
      },
      fontFamily: {
        sans: [
          'Alibaba PuHuiTi',
          'AlibabaPuHuiTi',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)',
        'card-lg': '0 2px 4px rgba(16,24,40,0.05), 0 16px 40px rgba(16,24,40,0.08)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'check-pop': 'check-pop 0.5s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
