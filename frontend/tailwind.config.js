/** Tokens mirror the "Smart Operator Assistant" design system (tokens.json). */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg0: '#0a0c0e', bg1: '#101317', bg2: '#161a1f', bg3: '#1d2228',
        line: '#2a3139', ctl: '#5a6571',
        ink: '#e9edf0', ink2: '#a9b2bc', ink3: '#838e99', onsig: '#15181c',
        safe: '#3fd08a', caution: '#f2b53a', elevated: '#ff8a3d', critical: '#ff5a52', assist: '#56c7db',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['Barlow', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
      boxShadow: {
        panel: '0 1px 0 #ffffff08 inset, 0 8px 24px #00000059',
        critical: '0 0 0 1px #ff5a5299, 0 0 32px #ff5a5240',
        assist: '0 0 0 1px #56c7db80, 0 0 24px #56c7db26',
      },
    },
  },
  plugins: [],
};
