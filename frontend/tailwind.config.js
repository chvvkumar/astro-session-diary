/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        astro: {
          dark: "#0a0a1a",
          panel: "#12122a",
          accent: "#4f7cff",
          muted: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};
