type ChatSessionMeta = { id: string; title: string; createdAt: string; updatedAt: string };

declare global {
	interface Window {
		turodesk: {
			chats: {
				list: () => Promise<ChatSessionMeta[]>;
				create: (title?: string) => Promise<ChatSessionMeta>;
				remove: (id: string) => Promise<void>;
				rename: (id: string, title: string) => Promise<ChatSessionMeta>;
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

import { h } from './ui/dom';
import { renderMarkdownFromRaw } from './ui/markdown';
import { buildSidebar } from './ui/sidebar';
import { renderHome } from './ui/home';
import { renderChat, renderMsg } from './ui/chat';

const state = {
	currentId: '' as string,
	sessions: [] as ChatSessionMeta[],
	mode: 'intro' as 'intro' | 'chat',
	search: '' as string,
	subscriptionsBound: false,
};

async function boot(): Promise<void> {
	state.sessions = await window.turodesk.chats.list();
	state.mode = 'intro';
	if (state.sessions.length > 0) state.currentId = state.sessions[0].id;
	bindStreamEventsOnce();
	await render();
}

function bindStreamEventsOnce(): void {
	if (state.subscriptionsBound) return;
	window.turodesk.chats.onToken(({ id, token }) => {
		if (id !== state.currentId) return;
		const el = document.getElementById('assistant-stream');
		if (!el) return;
		const prevRaw = el.getAttribute('data-raw') || '';
		const nextRaw = prevRaw + token;
		el.setAttribute('data-raw', nextRaw);
		// limpa placeholder/caret anteriores antes de renderizar
		el.innerHTML = '';
		renderMarkdownFromRaw(el, nextRaw);
		// adiciona caret de digitação enquanto ainda está chegando
		const caret = h('span', { class: 'typing-caret' }, ['|']);
		el.appendChild(caret);
		const list = document.getElementById('messages-list');
		if (list) list.scrollTop = list.scrollHeight;
	});
	window.turodesk.chats.onDone(({ id }) => {
		if (id !== state.currentId) return;
		const el = document.getElementById('assistant-stream');
		if (el) {
			// render final sem caret e remove id
			const raw = el.getAttribute('data-raw') || '';
			el.innerHTML = '';
			renderMarkdownFromRaw(el, raw);
			el.removeAttribute('id');
		}
	});
	state.subscriptionsBound = true;
}

async function render(): Promise<void> {
	const app = document.getElementById('app')!;
	app.innerHTML = '';

	const dragBar = h('div', { class: 'fixed top-0 left-0 right-0 h-8 z-20', style: '-webkit-app-region: drag;' });
	app.appendChild(dragBar);

	const sidebar = buildSidebar({
		sessions: state.sessions,
		currentId: state.currentId,
		mode: state.mode,
		search: state.search,
		onNewChat: onNewChat,
		onSelect: onSelect,
		onSearchChange: (value: string) => { state.search = value; void render(); },
		onRename: onRename,
		onDelete: onDelete,
	});
	const right = h('div', { class: 'h-full overflow-hidden' });

	const main = h('div', { class: 'h-[calc(100vh-2rem)] grid grid-cols-[16rem_1fr] md:grid-cols-[18rem_1fr] bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100' }, [sidebar, right]);
	app.appendChild(main);

	if (state.mode === 'intro') {
		renderHome(right, { onSubmit: onCreateFromIntroSubmit });
	} else {
		await renderChat(right, {
			sessionId: state.currentId,
			loadMessages: (id: string) => window.turodesk.chats.messages(id),
			onSend: onSendMessage,
		});
	}
}

async function onNewChat(): Promise<void> { state.mode = 'intro'; await render(); }
async function onSelect(id: string): Promise<void> { state.currentId = id; state.mode = 'chat'; await render(); }

async function onCreateFromIntroSubmit(value: string): Promise<void> {
	const session = await window.turodesk.chats.create('Nova conversa');
	state.sessions.unshift(session);
	state.currentId = session.id;
	state.mode = 'chat';
	await render();
	const list = document.getElementById('messages-list');
	if (!list) return;
	list.appendChild(renderMsg('user', value));
	list.appendChild(renderMsg('assistant', ''));
	(list as HTMLElement).scrollTop = list.scrollHeight;
	await window.turodesk.chats.sendStream(session.id, value);
}

async function onSendMessage(value: string): Promise<void> {
	const list = document.getElementById('messages-list')!;
	list.appendChild(renderMsg('user', value));
	list.appendChild(renderMsg('assistant', ''));
	(list as HTMLElement).scrollTop = list.scrollHeight;
	await window.turodesk.chats.sendStream(state.currentId, value);
}

async function onDelete(id: string): Promise<void> {
	await window.turodesk.chats.remove(id);
	state.sessions = state.sessions.filter((s) => s.id !== id);
	if (state.currentId === id) {
		if (state.sessions.length === 0) {
			state.mode = 'intro';
			state.currentId = '';
		} else {
			state.currentId = state.sessions[0].id;
		}
	}
	render();
}

async function onRename(id: string): Promise<void> {
	const current = state.sessions.find((s) => s.id === id);
	const newTitle = prompt('Novo nome da conversa', current?.title || '');
	if (!newTitle) return;
	const updated = await window.turodesk.chats.rename(id, newTitle);
	const idx = state.sessions.findIndex((s) => s.id === id);
	if (idx >= 0) state.sessions[idx] = updated;
	render();
}

window.addEventListener('DOMContentLoaded', () => { void boot(); });


