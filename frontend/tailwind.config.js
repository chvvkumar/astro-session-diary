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
        filter: {
          ha: "#c44040",
          oiii: "#3a8fd4",
          sii: "#d4a43a",
          l: "#e0e0e0",
          r: "#e05050",
          g: "#50b050",
          b: "#5070e0",
        },
      },
    },
  },
  plugins: [],
};
