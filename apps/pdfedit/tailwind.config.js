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
        },
      },
    },
  },
  plugins: [],
};
