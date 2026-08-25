/** @type {import('tailwindcss').Config} */
// Modernist tokens, mirrored from the design system's styles.css. Radius is 0
// everywhere on purpose — the system has no rounded corners.
module.exports = {
  content: ['./App.tsx', './app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    borderRadius: {
      none: '0px',
      DEFAULT: '0px',
      sm: '0px',
      md: '0px',
      lg: '0px',
      xl: '0px',
      '2xl': '0px',
      '3xl': '0px',
      full: '0px',
    },
    extend: {
      colors: {
        mod: {
          bg: '#f3f2f2',
          surface: '#eae9e9',
          ink: '#201e1d',
          accent: '#ec3013',
          divider: 'rgba(32,30,29,0.4)',
          neutral: {
            100: '#f8f4f4',
            200: '#eae7e7',
            300: '#d7d3d3',
            400: '#bab6b6',
            500: '#9b9797',
            600: '#7d7979',
            700: '#605d5d',
            800: '#444141',
            900: '#2d2b2b',
          },
          'accent-100': '#fff2ef',
          'accent-200': '#ffe0d9',
          'accent-300': '#ffc4b8',
          'accent-400': '#ff9783',
          'accent-500': '#ff563c',
          'accent-600': '#dd2b0f',
          'accent-700': '#ae1800',
          'accent-800': '#7c1405',
          'accent-900': '#4d170e',
        },
      },
      // fontFamily utilities, not fontWeight: on React Native a font-bold class
      // sets numeric weight and will not resolve a bundled family.
      fontFamily: {
        a: ['Archivo_400Regular'],
        'a-med': ['Archivo_500Medium'],
        'a-semi': ['Archivo_600SemiBold'],
        'a-bold': ['Archivo_700Bold'],
        'a-display': ['Archivo_800ExtraBold'],
      },
      letterSpacing: {
        label: '1.2px',
        display: '-0.4px',
      },
    },
  },
  plugins: [],
};
