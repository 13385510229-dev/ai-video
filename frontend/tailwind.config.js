/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'netflix-black': '#000000',
        'netflix-dark': '#121212',
        'netflix-gray': '#1a1a1a',
        'netflix-light-gray': '#333333',
        'netflix-text': '#ffffff',
        'netflix-subtext': '#888888',
        'accent-pink': '#ff6b9d',
        'accent-pink-dark': '#c44569',
        'accent-purple': '#a855f7',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'slide-up-delay-1': 'slideUp 0.5s ease-out 0.1s both',
        'slide-up-delay-2': 'slideUp 0.5s ease-out 0.2s both',
        'slide-up-delay-3': 'slideUp 0.5s ease-out 0.3s both',
        'slide-up-delay-4': 'slideUp 0.5s ease-out 0.4s both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'underline-slide': 'underlineSlide 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(255, 107, 157, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(255, 107, 157, 0.6)' },
        },
        underlineSlide: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      },
    },
  },
  plugins: [],
}
