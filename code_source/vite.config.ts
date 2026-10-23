import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function stripDotSlashAssetsPlugin(): Plugin {
  return {
    name: 'strip-dot-slash-assets',
    enforce: 'post',
    buildStart() {
      const assetsOutDir = path.resolve(__dirname, '../assets');
      if (fs.existsSync(assetsOutDir)) {
        fs.rmSync(assetsOutDir, { recursive: true, force: true });
      }
    },
    transformIndexHtml(html) {
      return html
        .replace(/(href|src)="\.\/assets\//g, '$1="assets/')
        .replace(/(href|src)="\/assets\//g, '$1="assets/')
        .replace(/(href|src)="\.\/icon\.svg/g, '$1="icon.svg')
        .replace(/(href|src)="\/icon\.svg/g, '$1="icon.svg');
    },
  };
}

export default defineConfig(() => {
  return {
    root: path.resolve(__dirname, '.'),
    base: './',
    plugins: [react(), tailwindcss(), stripDotSlashAssetsPlugin()],
    build: {
      target: 'chrome108',
      outDir: path.resolve(__dirname, '..'),
      assetsDir: 'assets',
      emptyOutDir: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
