declare global {
	interface FileSystemWritableFileStream {
		write(data: Blob): Promise<void>;
		close(): Promise<void>;
	}

	interface FileSystemFileHandle {
		createWritable(): Promise<FileSystemWritableFileStream>;
	}

	interface Window {
		showSaveFilePicker?: (options?: {
			suggestedName?: string;
			types?: Array<{ description?: string; accept: Record<string, `.${string}`[]> }>;
		}) => Promise<FileSystemFileHandle>;
	}

	namespace App {}
}

export {};
