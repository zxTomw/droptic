import { expect, test } from '@playwright/test';

test('hydrates the sender page under the production CSP', async ({ page }) => {
	const cspErrors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
			cspErrors.push(message.text());
		}
	});

	await page.goto('/send');
	await page.getByRole('button', { name: 'Prepare signal' }).click();

	await expect(page.getByText('Choose one file to send.')).toBeVisible();
	expect(cspErrors).toEqual([]);
});
