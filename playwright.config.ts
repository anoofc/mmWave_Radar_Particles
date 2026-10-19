import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/browser',use:{baseURL:'http://127.0.0.1:5173',headless:true},webServer:{command:'npm run dev --workspace web -- --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},projects:[{name:'chromium',use:{browserName:'chromium'}}]});
