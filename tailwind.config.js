/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#F15A29",   // TheCommerceShop signature orange
          dark:    "#1D1D1B",   // near-black for text / dark elements
          light:   "#FEF3EE",   // soft orange tint for backgrounds
          muted:   "#FBD9CC",   // light orange for hover/borders
          deep:    "#C04015",   // darker orange for hover states
        },
      },
    },
  },
  plugins: [],
}
