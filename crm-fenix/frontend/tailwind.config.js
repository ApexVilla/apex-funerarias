/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        fenix: {
          blue: "#185FA5"
        }
      }
    }
  },
  plugins: []
};
