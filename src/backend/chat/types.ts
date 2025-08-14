export interface ChatSessionMeta {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	createdAt: string;
}
