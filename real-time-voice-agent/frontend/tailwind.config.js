/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: "#93c5fd",   // soft blue
          DEFAULT: "#3b82f6", // primary blue
          dark: "#1d4ed8",    // deep blue
        },
        accent: {
          pink: "#ec4899",
          purple: "#9333ea",
        },
      },
      boxShadow: {
        glow: "0 0 10px rgba(59, 130, 246, 0.5)", // blue glow
        card: "0 4px 12px rgba(0,0,0,0.1)",       // subtle card shadow
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["Fira Code", "ui-monospace"],
      },
    },
  },
  plugins: [],
};
