import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import qaPlugin from './scripts/qa-v2-plugin.mjs';
export default defineConfig({plugins:[react(),qaPlugin()],base:'./',server:{watch:{ignored:['**/.work/**','**/out/**','**/runtime-current/**']}},build:{chunkSizeWarningLimit:1000}});
