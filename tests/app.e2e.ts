import { expect, test } from '@playwright/test';

test('the static application exposes both optical modes', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /send files through light/i })).toBeVisible();
	await expect(page.getByRole('link', { name: /send a file/i })).toHaveAttribute('href', '/send');
	await expect(page.getByRole('link', { name: /open receiver/i })).toHaveAttribute(
		'href',
		'/receive'
	);

	await page.goto('/receive');
	await expect(page.getByRole('heading', { name: /catch the signal/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /start rear camera/i })).toBeVisible();
});

test('a file is encrypted, RaptorQ encoded, and rendered by the sender worker', async ({
	page
}) => {
	test.setTimeout(90_000);
	await page.goto('/send');
	await page.locator('input[type="file"]').setInputFiles({
		name: 'optical-note.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('This file crosses the air as light. '.repeat(20))
	});
	await page.getByLabel('Passphrase', { exact: true }).fill('correct horse battery staple');
	await page.getByLabel('Confirm passphrase').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Prepare signal' }).click();
	await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible({
		timeout: 60_000
	});
	await page.getByRole('button', { name: 'Start playback' }).click();
	await expect(page.getByRole('heading', { name: /this signal may flicker/i })).toBeVisible();
	await page.getByRole('button', { name: /i understand/i }).click();
	await expect(page.getByLabel('Optical tile 1')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('the precached application launches without a network connection', async ({
	page,
	context,
	browserName
}) => {
	test.skip(
		browserName === 'webkit',
		'Playwright only exposes reliable service-worker automation in Chromium; physical iOS Safari remains a manual release gate.'
	);
	await page.addInitScript(() => {
		(globalThis as typeof globalThis & { __dropticDocumentToken?: string }).__dropticDocumentToken =
			`${Date.now()}-${Math.random()}`;
	});
	await page.goto('/receive');
	await page.evaluate(async () => {
		if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
		await navigator.serviceWorker.ready;
	});
	await page.reload();
	const onlineDocumentToken = await page.evaluate(
		() =>
			(globalThis as typeof globalThis & { __dropticDocumentToken?: string }).__dropticDocumentToken
	);
	await context.setOffline(true);
	await page.reload();
	await expect
		.poll(
			async () =>
				page
					.evaluate(
						() =>
							(globalThis as typeof globalThis & { __dropticDocumentToken?: string })
								.__dropticDocumentToken
					)
					.catch(() => onlineDocumentToken),
			{ message: 'a new document should load while offline' }
		)
		.not.toBe(onlineDocumentToken);
	await expect(page.getByRole('heading', { name: /catch the signal/i })).toBeVisible();
});
