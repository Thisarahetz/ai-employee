import type { Config } from "tailwindcss";

// Color tokens below follow the platform's validated data-viz / UI palette:
// blue = sequential "brand" ramp, status = fixed good/warning/serious/critical,
// ink/surface/line = chrome & text tokens. Light theme only for this scaffold.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f8fe",
          100: "#cde2fb",
          200: "#9ec5f4",
          300: "#6da7ec",
          400: "#3987e5",
          500: "#2a78d6",
          600: "#256abf",
          700: "#1c5cab",
          800: "#184f95",
          900: "#0d366b",
        },
        // Used by the Team pages; it was never defined, so those classes did nothing.
        accent: {
          DEFAULT: "#1c5cab", // brand-700 (readable on white and on soft)
          soft: "#e3eefc",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
        ink: {
          primary: "#0b0b0b",
          secondary: "#52514e",
          muted: "#6e6c67", // darkened from #898781 to pass WCAG AA (4.5:1) on white and page backgrounds
        },
        surface: {
          DEFAULT: "#fcfcfb",
          page: "#f9f9f7",
        },
        line: "#e1e0d9",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
