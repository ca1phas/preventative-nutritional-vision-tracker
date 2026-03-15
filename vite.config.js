import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        tailwindcss(),
    ],
    server: {
        port: 8080,
    },
    build: {
        rollupOptions: {
            input: {
                // List ALL your HTML files here
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'login.html'),
                signup: resolve(__dirname, 'signup.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                history: resolve(__dirname, 'history.html'),
                upload: resolve(__dirname, 'upload.html'),
                output: resolve(__dirname, 'output.html'),
                nutritionDetails: resolve(__dirname, 'nutritionDetails.html'),
                userProfile: resolve(__dirname, 'userProfile.html'),
                userDashboard: resolve(__dirname, 'userDashboard.html'),
                confirm: resolve(__dirname, 'confirm.html')
            }
        }
    }
});