import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/demandas': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            }
        }
    }
});
