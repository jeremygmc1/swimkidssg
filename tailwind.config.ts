import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.mdx',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#E0F6FB',
          100: '#B8EAF6',
          500: '#29B8D8',
          600: '#1EA8C8',
          700: '#1B3A6B',
          900: '#152D52',
        },
        cyan: {
          400: '#7DD8EC',
          500: '#29B8D8',
          600: '#1EA8C8',
        },
        highlight: {
          400: '#F7B84B',
          500: '#F5A623',
          600: '#E8960F',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
