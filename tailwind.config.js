/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#b7cdff",
          300: "#8fb1ff",
          400: "#5f8cff",
          500: "#0b5ed7",
          600: "#0a53c2",
          700: "#0a3fa8",
          800: "#0a3285",
          900: "#08286a",
        },
        surface: "#ffffff",
        canvas: "#f3f6fb",
        ink: "#0f1f38",
        muted: "#4b5b76",
        line: "#dbe4f0",
        success: "#15803d",
        warning: "#b45309",
        danger: "#b91c1c",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,31,56,0.06), 0 8px 24px rgba(15,31,56,0.06)",
        soft: "0 1px 2px rgba(15,31,56,0.04)",
        lift: "0 12px 32px rgba(15,31,56,0.12)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
