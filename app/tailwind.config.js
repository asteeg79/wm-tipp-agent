/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Konfidenz-Farbskala
        confidence: {
          low: "#ef4444",
          mid: "#f59e0b",
          high: "#22c55e",
        },
      },
    },
  },
  plugins: [],
};
