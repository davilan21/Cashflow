import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#EFECF4",
        surface: "#FFFFFF",
        ink: "#211D2B",
        muted: "#6E6879",
        line: "#DED9E6",
        ok: "#4E8C5A",
        alerta: "#C4544F",
        aviso: "#C08A2E",
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "IBM Plex Sans", "system-ui", "sans-serif"],
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
