export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Short phones (e.g. 360×640): tighter vertical spacing.
      screens: { short: { raw: '(max-height: 700px)' } },
      colors: {
        ink: { DEFAULT: '#151515', soft: '#2A2A2A' },
        sun: { DEFAULT: '#FFD966', deep: '#F7C548', pale: '#FFF4CC' },
        fog: { DEFAULT: '#EFEFEF', soft: '#F6F6F6' },
        line: '#E4E4E4',
        mute: { DEFAULT: '#8C8C8C', dark: '#5E5E5E' },
      },
      borderRadius: { card: '24px', sheet: '32px' },
      boxShadow: { float: '0 8px 24px rgba(0,0,0,.10)', sheet: '0 -8px 32px rgba(0,0,0,.08)' },
    },
  },
  plugins: [],
};
