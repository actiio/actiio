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
          primary: "#00bf63",
          hover: "#00a855",
          body: "#4b5563",
          heading: "#0a0a0a",
          surface: "#f9fafb"
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'brand': '0 10px 15px -3px rgba(0, 191, 99, 0.1), 0 4px 6px -2px rgba(0, 191, 99, 0.05)',
      },
      transitionDuration: {
        'DEFAULT': '200ms',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
