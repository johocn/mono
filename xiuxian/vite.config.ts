import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5180,
  },
  build: {
    target: "es2018",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        editor: "editor.html",
      },
    },
  },
});
