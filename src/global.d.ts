declare global {
	interface Window {
		turodesk: {
			chats: {
				list: () => Promise<Array<{ id: string; title: string; createdAt: string; updatedAt: string }>>;
				create: (title?: string) => Promise<{ id: string; title: string; createdAt: string; updatedAt: string }>;
				remove: (id: string) => Promise<void>;
				rename: (id: string, title: string) => Promise<{ id: string; title: string; createdAt: string; updatedAt: string }>;
				messages: (id: string) => Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string; createdAt: string }>>;
				send: (id: string, input: string) => Promise<{ role: 'assistant' | 'system' | 'user'; content: string; createdAt: string }>;
				sendStream: (id: string, input: string) => Promise<{ role: 'assistant' | 'system' | 'user'; content: string; createdAt: string }>;
				onToken: (handler: (data: { id: string; token: string }) => void) => void;
				onDone: (handler: (data: { id: string; full: string }) => void) => void;
				offToken: (handler: (data: { id: string; token: string }) => void) => void;
				offDone: (handler: (data: { id: string; full: string }) => void) => void;
			};
		};
	}
}

export {};

declare module 'pg';
