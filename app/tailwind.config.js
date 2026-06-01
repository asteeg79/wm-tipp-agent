/** @type {import('tailwindcss').Config} */

// Semantische Farbe aus CSS-Variable (RGB-Tripel) → erlaubt Opacity-Modifier.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantische Theme-Tokens (schalten je .light/.dark um).
        canvas: v("canvas"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        edge: v("edge"),
        "edge-strong": v("edge-strong"),
        fg: v("fg"),
        "fg-soft": v("fg-soft"),
        "fg-muted": v("fg-muted"),
        "fg-faint": v("fg-faint"),
        pos: v("pos"),
        warn: v("warn"),
        neg: v("neg"),
        info: v("info"),
        brand: v("brand"),
        // Konfidenz-Farbskala (themeunabhängig).
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
