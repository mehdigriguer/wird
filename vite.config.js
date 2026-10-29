import { defineConfig } from "vite";

// Le site est servi sous /wird/ sur GitHub Pages. Le dev local reste à la
// racine pour ne pas changer l'URL des tests et du dev server.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/wird/" : "/",
}));
