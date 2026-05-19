/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design system — Rule 10.1
        positive: '#16a34a',   // green-600
        negative: '#dc2626',   // red-600
        neutral:  '#6b7280',   // gray-500
        surface:  '#f9fafb',   // gray-50
        border:   '#e5e7eb',   // gray-200
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
