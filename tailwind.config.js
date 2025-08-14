/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx,html}"
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            pre: { backgroundColor: 'rgba(0,0,0,0.06)' },
            code: { backgroundColor: 'rgba(0,0,0,0.06)', padding: '0.2rem 0.35rem', borderRadius: '0.25rem' },
          }
        }
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};


