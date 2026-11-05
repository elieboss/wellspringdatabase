import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' makes the built files work from any folder,
// including https://<user>.github.io/<repo>/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()]
});
