module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "page-bg": "var(--page-bg)",
        "surface": "var(--surface)",
        "surface-soft": "var(--surface-soft)",
        "surface-muted": "var(--surface-muted)",
        "text-strong": "var(--text-strong)",
        "text-muted": "var(--text-muted)",
        "border-main": "var(--border)",
        "border-soft": "var(--border-soft)",
        "brand": "var(--brand)",
        "brand-deep": "var(--brand-deep)",
        // Semantic color names for consistency with other pages
        "card": "var(--surface)",
        "muted": "var(--surface-muted)",
        "border": "var(--border)",
        "foreground": "var(--text-strong)",
        "muted-foreground": "var(--text-muted)",
        "success": "var(--color-success)",
      },
      spacing: {
        "safe": "16px",
      },
      borderRadius: {
        "xl": "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};
