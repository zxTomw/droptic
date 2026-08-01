import type { ReceivedFile } from './types';

export async function shareReceivedFile(received: ReceivedFile): Promise<boolean> {
	if (!navigator.share || !navigator.canShare?.({ files: [received.file] })) return false;
	await navigator.share({ files: [received.file], title: received.file.name });
	return true;
}

export async function saveReceivedFile(received: ReceivedFile): Promise<'picker' | 'download'> {
	if (window.showSaveFilePicker) {
		const handle = await window.showSaveFilePicker({
			suggestedName: received.file.name,
			types: [
				{
					description: 'Received file',
					accept: {
						[received.file.type || 'application/octet-stream']: [extension(received.file.name)]
					}
				}
			]
		});
		const writable = await handle.createWritable();
		await writable.write(received.file);
		await writable.close();
		return 'picker';
	}

	const url = URL.createObjectURL(received.file);
	try {
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = received.file.name;
		anchor.rel = 'noopener';
		anchor.click();
		return 'download';
	} finally {
		setTimeout(() => URL.revokeObjectURL(url), 1_000);
	}
}

function extension(filename: string): `.${string}` {
	const match = filename.match(/(\.[a-z0-9]{1,12})$/i);
	return (match?.[1] ?? '.bin') as `.${string}`;
}
