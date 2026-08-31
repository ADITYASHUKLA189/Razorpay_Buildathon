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
        background: "#09090b", // zinc-950
        surface: "rgba(24, 24, 27, 0.5)", // zinc-900/50
        text: "#fafafa", // zinc-50
        dim: "#a1a1aa", // zinc-400
        stage: {
          exact: "#10b981", // emerald-500
          rule: "#f59e0b", // amber-500
          ai: "#6366f1", // indigo-500
          exception: "#ef4444" // red-500
        }
      },
      fontFamily: {
        display: ["var(--font-inter)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
