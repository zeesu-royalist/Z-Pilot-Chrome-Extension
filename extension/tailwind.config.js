/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./sidepanel.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pilot: {
          bg: '#080302',           // Deep Ember Black
          panel: '#140603',        // Elevated panel
          card: 'rgba(0, 0, 0, 0.55)', // Frosted card
          cardHover: 'rgba(255, 255, 255, 0.08)',
          border: 'rgba(255, 255, 255, 0.12)',
          borderSubtle: 'rgba(255, 255, 255, 0.06)',
          borderStrong: 'rgba(249, 115, 22, 0.4)',
          primary: '#EA580C',      // Fiery Orange
          primaryHover: '#C2410C', // Dark Orange Hover
          primaryText: '#FFFFFF',  // White text
          accent: '#FB923C',       // Warm Amber Sparkle
          success: '#10B981',      // Emerald Green
          warning: '#F59E0B',      // Amber
          danger: '#EF4444',       // Coral Red
          text: {
            primary: '#FFFFFF',    // Pure White
            secondary: 'rgba(255, 255, 255, 0.75)',
            muted: 'rgba(255, 255, 255, 0.45)',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
};
