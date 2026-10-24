import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const APP_VERSION = '1.3.0';

const IMPORT_MAP = {
  imports: {
    'react': 'https://esm.sh/react@19.0.1',
    'react/jsx-runtime': 'https://esm.sh/react@19.0.1/jsx-runtime',
    'react-dom': 'https://esm.sh/react-dom@19.0.1?external=react',
    'react-dom/client': 'https://esm.sh/react-dom@19.0.1/client?external=react',
    'lucide-react': 'https://esm.sh/lucide-react@0.546.0?external=react',
    'three': 'https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.min.js',
  },
};

function stripDotSlashAssetsPlugin(): Plugin {
  return {
    name: 'strip-dot-slash-assets',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      const assetsOutDir = path.resolve(import.meta.dirname, '../assets');
      if (fs.existsSync(assetsOutDir)) {
        fs.rmSync(assetsOutDir, { recursive: true, force: true });
      }
    },
    transformIndexHtml(html) {
      const importMapTag = `    <script type="importmap">\n      ${JSON.stringify(IMPORT_MAP)}\n    </script>\n`;
      return html
        .replace('<script type="module"', `${importMapTag}    <script type="module"`)
        .replace(/(href|src)="\.\/assets\/([^"]+)"/g, `$1="assets/$2?v=${APP_VERSION}"`)
        .replace(/(href|src)="\/assets\/([^"]+)"/g, `$1="assets/$2?v=${APP_VERSION}"`)
        .replace(/(href|src)="\.\/icon\.svg/g, '$1="icon.svg')
        .replace(/(href|src)="\/icon\.svg/g, '$1="icon.svg');
    },
  };
}

export default defineConfig(() => {
  return {
    root: path.resolve(import.meta.dirname, '.'),
    base: './',
    plugins: [react(), tailwindcss(), stripDotSlashAssetsPlugin()],
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: false,
    },
    build: {
      target: 'chrome108',
      outDir: path.resolve(import.meta.dirname, '..'),
      assetsDir: 'assets',
      emptyOutDir: false,
      rollupOptions: {
        external: [
          'react',
          'react/jsx-runtime',
          'react-dom',
          'react-dom/client',
          'lucide-react',
          'three',
        ],
        output: {
          entryFileNames: 'assets/index-DXDE9Wx8.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/index-CX6SStW8.[ext]',
          manualChunks(id) {
            if (
              id.includes('world3d') ||
              id.includes('textures') ||
              id.includes('mapRenderer')
            ) {
              return 'world3d';
            }
            if (id.includes('rules') || id.includes('tangierMapData')) {
              return 'rules';
            }
            if (id.includes('components/')) {
              return 'ui';
            }
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
  };
});
