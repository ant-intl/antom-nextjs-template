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
    },
  },
  plugins: [],
};

export default config;
