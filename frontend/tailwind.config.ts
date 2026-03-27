import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#00bf63", // Action Green
          hover: "#00a855",
          body: "#4b5563",
          heading: "#0a0a0a", // Deep Black
          surface: "#f9fafb",
          muted: "#6b7280",
          accent: "#10b981", // Emerald
          dark: "#111827", // Slate 900
          border: "#e5e7eb",
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '3rem',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'brand': '0 10px 15px -3px rgba(0, 191, 99, 0.1), 0 4px 6px -2px rgba(0, 191, 99, 0.05)',
        'premium': '0 25px 50px -12px rgba(0, 0, 0, 0.08)',
        'glow': '0 0 15px 5px rgba(0, 191, 99, 0.15)',
      },
      animation: {
        'bounce-subtle': 'bounce-subtle 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
      },
      keyframes: {
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-20px) rotate(2deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        }
      },
      transitionDuration: {
        'DEFAULT': '300ms',
        'slow': '500ms',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
