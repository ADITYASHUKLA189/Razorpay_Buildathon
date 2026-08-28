import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0A08",
        surface: "#161310",
        border: "#312B21",
        text: "#F3EEE3",
        dim: "#A79C87",
        gold: {
          DEFAULT: "#C9A227",
          bright: "#E0BE45"
        },
        stage: {
          exact: "#8AAE7E",
          rule: "#C9A227",
          ai: "#5C9C93",
          exception: "#C1652E"
        }
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
