/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'editor': {
          // Rich dark theme with depth
          'bg': '#0a0a0f',
          'bg-gradient': '#0f0f18',
          'surface': 'rgba(20, 20, 30, 0.8)',
          'surface-solid': '#14141e',
          'surface-light': 'rgba(30, 30, 45, 0.9)',
          'surface-hover': 'rgba(40, 40, 60, 0.9)',
          'border': 'rgba(255, 255, 255, 0.08)',
          'border-light': 'rgba(255, 255, 255, 0.12)',
          'text': '#f0f0f5',
          'text-secondary': '#a0a0b0',
          'text-dim': '#606070',
          // Modern accent colors
          'accent': '#6366f1',
          'accent-light': '#818cf8',
          'accent-glow': 'rgba(99, 102, 241, 0.3)',
          'success': '#10b981',
          'success-glow': 'rgba(16, 185, 129, 0.3)',
          'warning': '#f59e0b',
          'warning-glow': 'rgba(245, 158, 11, 0.3)',
          'error': '#ef4444',
          'error-glow': 'rgba(239, 68, 68, 0.3)',
        },
        // Node category colors - vibrant but refined
        'node': {
          'input': '#10b981',
          'output': '#f43f5e',
          'transform': '#3b82f6',
          'adjust': '#f59e0b',
          'filter': '#a855f7',
          'composite': '#ec4899',
          'mask': '#6366f1',
          'ai': '#14b8a6',
          'utility': '#64748b',
        },
        // Port data type colors
        'port': {
          'image': '#f59e0b',
          'mask': '#a855f7',
          'number': '#3b82f6',
          'color': '#ec4899',
          'boolean': '#10b981',
          'string': '#6366f1',
        }
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(99, 102, 241, 0.15)',
        'glow-lg': '0 0 40px rgba(99, 102, 241, 0.2)',
        'elevated': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'elevated-lg': '0 16px 48px rgba(0, 0, 0, 0.5)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'node': '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)',
        'node-selected': '0 0 0 2px rgba(99, 102, 241, 0.5), 0 8px 32px rgba(0, 0, 0, 0.5)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
        'dash-flow': 'dash-flow 0.5s linear infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'dash-flow': {
          'to': { strokeDashoffset: '-12' },
        },
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
