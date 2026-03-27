import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: {
          950: "#f6f8fc",
          900: "#eef3f9",
          850: "#e6edf6",
          800: "#dce5f0",
          760: "#d2ddea",
          700: "#bccbdd",
          600: "#97a8bb",
          500: "#6f8096",
          400: "#526171",
          300: "#3a4654",
          200: "#25313d",
          100: "#121b24",
        },
        accent: {
          500: "#2f76d2",
          400: "#4b8de0",
          300: "#6fa7f0",
        },
        lime: {
          400: "#4ca66a",
        },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"PingFang SC"', '"Microsoft YaHei UI"', "sans-serif"],
      },
      boxShadow: {
        glow: "0 16px 36px rgba(84, 102, 132, 0.14)",
      },
      keyframes: {
        "panel-in": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "panel-in": "panel-in 220ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
