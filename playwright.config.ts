import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'bun run build && bun run preview', port: 4173 },
	use: { baseURL: 'http://127.0.0.1:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});
