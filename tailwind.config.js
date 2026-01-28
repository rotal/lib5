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
          'bg': '#1a1a2e',
          'surface': '#252542',
          'surface-light': '#2d2d4a',
          'border': '#3d3d5c',
          'text': '#e0e0e0',
          'text-dim': '#808090',
          'accent': '#6366f1',
          'accent-hover': '#818cf8',
          'success': '#22c55e',
          'warning': '#f59e0b',
          'error': '#ef4444',
        },
        'node': {
          'input': '#22c55e',
          'output': '#ef4444',
          'transform': '#3b82f6',
          'adjust': '#f59e0b',
          'filter': '#8b5cf6',
          'composite': '#ec4899',
          'mask': '#6366f1',
          'ai': '#14b8a6',
        },
        'port': {
          'image': '#f59e0b',
          'mask': '#8b5cf6',
          'number': '#3b82f6',
          'color': '#ec4899',
          'boolean': '#22c55e',
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
    },
  },
  plugins: [],
};
