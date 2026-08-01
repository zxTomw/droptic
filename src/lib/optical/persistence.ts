import type { ResumableSession } from './types';

const DATABASE_NAME = 'droptic-receiver-v1';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const FRAME_STORE = 'frames';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SessionRecord extends ResumableSession {
	bootstrapFrame: ArrayBuffer;
}

interface FrameRecord {
	key: string;
	sessionId: string;
	sequence: number;
	bytes: ArrayBuffer;
	updatedAt: number;
}

const pendingFrames: FrameRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;

export async function persistSession(
	session: ResumableSession,
	bootstrapFrame: Uint8Array
): Promise<void> {
	const database = await openDatabase();
	await transactionDone(
		database
			.transaction(SESSION_STORE, 'readwrite')
			.objectStore(SESSION_STORE)
			.put({ ...session, bootstrapFrame: copyBuffer(bootstrapFrame) } satisfies SessionRecord)
	);
	database.close();
}

export function persistReceivedFrame(sessionId: string, sequence: number, frame: Uint8Array): void {
	pendingFrames.push({
		key: `${sessionId}:${sequence}`,
		sessionId,
		sequence,
		bytes: copyBuffer(frame),
		updatedAt: Date.now()
	});
	if (pendingFrames.length >= 16) void flushPersistedFrames();
	else if (!flushTimer) {
		flushTimer = setTimeout(() => {
			flushTimer = null;
			void flushPersistedFrames().catch((error) =>
				console.error('Droptic frame persistence failed.', error)
			);
		}, 250);
	}
}

export async function flushPersistedFrames(): Promise<void> {
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = null;
	if (flushPromise) await flushPromise;
	if (!pendingFrames.length) return;
	const batch = pendingFrames.splice(0, pendingFrames.length);
	flushPromise = writeFrameBatch(batch);
	try {
		await flushPromise;
	} catch (error) {
		pendingFrames.unshift(...batch);
		throw error;
	} finally {
		flushPromise = null;
	}
	if (pendingFrames.length >= 16) await flushPersistedFrames();
}

export async function listResumableSessions(): Promise<ResumableSession[]> {
	await cleanupExpiredSessions();
	const database = await openDatabase();
	const records = (await requestValue(
		database.transaction(SESSION_STORE).objectStore(SESSION_STORE).getAll()
	)) as SessionRecord[];
	database.close();
	return records
		.map(({ sessionId, updatedAt, receivedPackets, estimatedPackets }) => ({
			sessionId,
			updatedAt,
			receivedPackets,
			estimatedPackets
		}))
		.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function loadPersistedSession(
	sessionId: string
): Promise<{ session: SessionRecord; frames: Uint8Array[] } | null> {
	await flushPersistedFrames();
	const database = await openDatabase();
	const session = (await requestValue(
		database.transaction(SESSION_STORE).objectStore(SESSION_STORE).get(sessionId)
	)) as SessionRecord | undefined;
	if (!session) {
		database.close();
		return null;
	}
	const index = database.transaction(FRAME_STORE).objectStore(FRAME_STORE).index('sessionId');
	const records = (await requestValue(index.getAll(IDBKeyRange.only(sessionId)))) as FrameRecord[];
	database.close();
	records.sort((left, right) => left.sequence - right.sequence);
	return { session, frames: records.map((record) => new Uint8Array(record.bytes)) };
}

export async function clearPersistedSession(sessionId: string): Promise<void> {
	await flushPersistedFrames();
	const database = await openDatabase();
	const transaction = database.transaction([SESSION_STORE, FRAME_STORE], 'readwrite');
	transaction.objectStore(SESSION_STORE).delete(sessionId);
	const index = transaction.objectStore(FRAME_STORE).index('sessionId');
	const cursorRequest = index.openKeyCursor(IDBKeyRange.only(sessionId));
	cursorRequest.onsuccess = () => {
		const cursor = cursorRequest.result;
		if (!cursor) return;
		transaction.objectStore(FRAME_STORE).delete(cursor.primaryKey);
		cursor.continue();
	};
	await transactionComplete(transaction);
	database.close();
}

export async function cleanupExpiredSessions(): Promise<void> {
	const database = await openDatabase();
	const records = (await requestValue(
		database.transaction(SESSION_STORE).objectStore(SESSION_STORE).getAll()
	)) as SessionRecord[];
	database.close();
	const cutoff = Date.now() - SESSION_MAX_AGE_MS;
	await Promise.all(
		records
			.filter((record) => record.updatedAt < cutoff)
			.map((record) => clearPersistedSession(record.sessionId))
	);
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(SESSION_STORE)) {
				database.createObjectStore(SESSION_STORE, { keyPath: 'sessionId' });
			}
			if (!database.objectStoreNames.contains(FRAME_STORE)) {
				const store = database.createObjectStore(FRAME_STORE, { keyPath: 'key' });
				store.createIndex('sessionId', 'sessionId', { unique: false });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Could not open receiver storage.'));
	});
}

function transactionDone(request: IDBRequest): Promise<void> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(request.error ?? new Error('Could not update receiver storage.'));
	});
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('Storage transaction failed.'));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('Storage transaction was aborted.'));
	});
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Storage request failed.'));
	});
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.slice().buffer;
}

async function writeFrameBatch(records: FrameRecord[]): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction(FRAME_STORE, 'readwrite');
	const store = transaction.objectStore(FRAME_STORE);
	for (const record of records) store.put(record);
	await transactionComplete(transaction);
	database.close();
}
