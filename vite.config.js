import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Repo is deployed at https://ndaly111.github.io/Sbx-read-aloud/
  base: command === 'build' ? '/Sbx-read-aloud/' : '/',
}));
