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
            h1: {
              fontWeight: '700',
              fontSize: '1.75rem',
              lineHeight: '1.25',
              paddingBottom: '0.25rem',
              borderBottom: '1px solid rgba(27, 31, 36, 0.15)'
            },
            h2: {
              fontWeight: '700',
              fontSize: '1.375rem',
              lineHeight: '1.3',
              paddingBottom: '0.25rem',
              borderBottom: '1px solid rgba(27, 31, 36, 0.15)'
            },
            h3: {
              fontWeight: '600',
              fontSize: '1.125rem',
              lineHeight: '1.4'
            },
            pre: {
              backgroundColor: '#f6f8fa',
              border: '1px solid rgba(27, 31, 36, 0.15)',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              overflow: 'auto',
              position: 'relative'
            },
            code: {
              backgroundColor: 'rgba(175, 184, 193, 0.2)',
              padding: '0.2rem 0.35rem',
              borderRadius: '0.375rem'
            },
            blockquote: {
              color: '#57606a',
              borderLeft: '4px solid rgba(27, 31, 36, 0.2)',
              paddingLeft: '1rem',
            },
            hr: {
              borderColor: 'rgba(27, 31, 36, 0.15)'
            }
          }
        }
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};


