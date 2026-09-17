import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // Brand
        "pollar-blue": "hsl(216, 98%, 52%)",
        "pollar-blue-hover": "hsl(216, 90%, 42%)",
        // Surfaces
        surface: "hsl(0, 0%, 100%)",
        "surface-hover": "hsl(210, 40%, 96%)",
        "surface-border": "hsl(214, 32%, 91%)",
        // Background
        background: "hsl(210, 40%, 98%)",
        foreground: "hsl(222, 47%, 11%)",
        // Status
        success: "hsl(160, 84%, 39%)",
        danger: "hsl(0, 84%, 60%)",
        warning: "hsl(38, 92%, 50%)",
        muted: "hsl(215, 16%, 47%)",
      },
      boxShadow: {
        blue: "0 4px 14px hsla(216, 98%, 52%, 0.35)",
        "blue-lg": "0 6px 24px hsla(216, 98%, 52%, 0.4)",
        card: "0 4px 30px hsla(0, 0%, 0%, 0.06)",
        "card-hover": "0 8px 24px hsla(0, 0%, 0%, 0.08)",
        modal: "0 24px 64px hsla(0, 0%, 0%, 0.15)",
        toast: "0 8px 32px hsla(0, 0%, 0%, 0.12)",
      },
      backdropBlur: {
        glass: "12px",
      },
      keyframes: {
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        radialPulse: {
          "0%": { boxShadow: "0 0 0 0 hsla(216, 98%, 52%, 0.4)" },
          "70%": { boxShadow: "0 0 0 10px hsla(216, 98%, 52%, 0)" },
          "100%": { boxShadow: "0 0 0 0 hsla(216, 98%, 52%, 0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        toastIn: {
          "0%": { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-slide-up": "fadeSlideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        pulse2: "radialPulse 2s infinite",
        "slide-up": "slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "toast-in": "toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
