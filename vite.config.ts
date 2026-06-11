import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function injectServiceWorkerBuildId(): Plugin {
  return {
    name: 'inject-service-worker-build-id',
    closeBundle() {
      const swPath = resolve(import.meta.dirname, 'dist/sw.js');
      const buildId = Date.now().toString(36);
      const contents = readFileSync(swPath, 'utf-8');
      writeFileSync(swPath, contents.replace('__BUILD_ID__', buildId));
    },
  };
}

export default defineConfig({
  base: '/runbookle/',
  plugins: [react(), injectServiceWorkerBuildId()],
});
