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

import { marked } from 'marked';
import DOMPurify from 'dompurify';

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
	if (state.sessions.length > 0) {
		state.currentId = state.sessions[0].id;
	}
	bindStreamEventsOnce();
	render();
}

function bindStreamEventsOnce(): void {
	if (state.subscriptionsBound) return;
	window.turodesk.chats.onToken(({ id, token }) => {
		if (id !== state.currentId) return;
		const el = document.getElementById('assistant-stream');
		if (!el) return;
		el.textContent = (el.textContent || '') + token;
		renderMarkdownInto(el);
		const list = document.getElementById('messages-list');
		if (list) list.scrollTop = list.scrollHeight;
	});
	window.turodesk.chats.onDone(({ id }) => {
		if (id !== state.currentId) return;
		const el = document.getElementById('assistant-stream');
		if (el) el.removeAttribute('id');
	});
	state.subscriptionsBound = true;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') el.className = v;
		else if (k === 'value') (el as HTMLInputElement).value = v;
		else if (k.startsWith('on') && typeof v === 'function') (el as any)[k.toLowerCase()] = v;
		else if (k === 'title') el.setAttribute('title', String(v));
		else el.setAttribute(k, String(v));
	});
	children.forEach((c) => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
	return el;
}

async function render(): Promise<void> {
	const app = document.getElementById('app')!;
	app.innerHTML = '';

	const dragBar = h('div', { class: 'fixed top-0 left-0 right-0 h-8 z-20', style: '-webkit-app-region: drag;' });
	app.appendChild(dragBar);

	const sidebar = buildSidebar();
	const right = h('div', { class: 'h-full overflow-hidden' });

	const main = h('div', { class: 'h-[calc(100vh-2rem)] grid grid-cols-[16rem_1fr] md:grid-cols-[18rem_1fr] bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100' }, [sidebar, right]);
	app.appendChild(main);

	if (state.mode === 'intro') renderIntroPane(right);
	else await renderChatPane(right);
}

function buildSidebar(): HTMLElement {
	const sidebar = h('div', { class: 'w-64 md:w-72 h-full shrink-0 border-r border-black/10 dark:border-white/10 p-3 space-y-3 overflow-y-auto' });
	const header = h('div', { class: 'flex items-center justify-between' }, [
		h('div', { class: 'font-medium text-sm text-slate-500 dark:text-slate-400' }, ['Conversas']),
		h('button', { class: 'px-2 py-1 rounded-md bg-indigo-500 text-white text-sm hover:bg-indigo-600 active:scale-[.99] transition', onclick: onNewChat, title: 'Novo chat (N)' }, ['Novo']),
	]);

	const searchWrap = h('div', { class: 'relative' }, [
		h('span', { class: 'absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' }, [svgSearch()]),
		h('input', { class: 'w-full h-9 pl-9 pr-3 rounded-md bg-white/70 dark:bg-neutral-900/70 outline-none placeholder:text-slate-400', placeholder: 'Pesquisar conversas...', value: state.search, oninput: onSearchChange })
	]);

	const list = h('div', { class: 'space-y-1' });
	const filtered = state.sessions.filter((s) => s.title.toLowerCase().includes(state.search.toLowerCase()));
	filtered.forEach((s) => {
		const active = s.id === state.currentId && state.mode === 'chat';
		const item = h('div', { class: `group flex items-center justify-between px-2 py-2 rounded-lg ${active ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300' : 'hover:bg-black/5 dark:hover:bg-white/5'}` });
		const textBox = h('div', { class: 'min-w-0 flex-1' }, [
			h('button', { class: 'text-left truncate w-full', onclick: () => onSelect(s.id) }, [s.title]),
			h('div', { class: 'text-[11px] text-slate-400 mt-0.5' }, [formatShortDate(s.updatedAt)])
		]);
		const actions = h('div', { class: 'flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity' }, [
			iconBtn(svgEdit(), () => onRename(s.id), 'Renomear'),
			iconBtn(svgTrash(), () => onDelete(s.id), 'Apagar'),
		]);
		item.appendChild(textBox);
		item.appendChild(actions);
		list.appendChild(item);
	});

	sidebar.appendChild(header);
	sidebar.appendChild(searchWrap);
	sidebar.appendChild(list);
	return sidebar;
}

function iconBtn(icon: HTMLElement, onclick: () => void, title?: string): HTMLElement {
	return h('button', { class: 'p-1.5 rounded-md bg-slate-200/70 dark:bg-neutral-800/70 hover:bg-slate-200 dark:hover:bg-neutral-700 transition', onclick, title }, [icon]);
}

function svgSearch(): HTMLElement { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('class', 'w-4 h-4'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-width', '2'); path.setAttribute('d', 'M21 21l-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z'); el.appendChild(path); return el as unknown as HTMLElement; }
function svgEdit(): HTMLElement { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('class', 'w-4 h-4'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-width', '2'); path.setAttribute('d', 'M11 4h2m-9 9l-1 4 4-1 10-10a2.828 2.828 0 1 0-4-4L3 12z'); el.appendChild(path); return el as unknown as HTMLElement; }
function svgTrash(): HTMLElement { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('class', 'w-4 h-4'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-width', '2'); path.setAttribute('d', 'M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1'); el.appendChild(path); return el as unknown as HTMLElement; }

function formatShortDate(iso: string): string { try { const d = new Date(iso); return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } }

function renderIntroPane(parent: HTMLElement): void {
	const wrap = h('div', { class: 'h-full grid place-items-center p-8' }, [
		h('div', { class: 'text-center' }, [
			h('h1', { class: 'text-4xl font-semibold tracking-tight bg-gradient-to-r from-indigo-500 to-sky-400 bg-clip-text text-transparent' }, ['Turodesk']),
			h('p', { class: 'mt-1 text-slate-500 dark:text-slate-400' }, ['Seu espaço de trabalho rápido e minimalista']),
			h('form', { class: 'mt-6 w-[min(640px,92vw)] mx-auto', onsubmit: onCreateFromIntro }, [
				h('div', { class: 'glass-panel px-4 py-2' }, [
					h('input', { id: 'intro-input', class: 'w-full h-12 bg-transparent outline-none text-base placeholder:text-slate-400', placeholder: 'Digite sua primeira mensagem...', autofocus: true })
				])
			])
		])
	]);
	parent.appendChild(wrap);
	(document.getElementById('intro-input') as HTMLInputElement)?.focus();
}

async function renderChatPane(parent: HTMLElement): Promise<void> {
	const messagesWrap = h('div', { class: 'h-full grid grid-rows-[1fr_auto] overflow-hidden' });
	const messagesList = h('div', { id: 'messages-list', class: 'p-4 overflow-auto space-y-3' });
	const inputRow = h('form', { class: 'p-3 border-t border-black/10 dark:border-white/10 grid grid-cols-[1fr_auto] gap-2', onsubmit: onSend }, [
		h('input', { id: 'msg', class: 'h-11 px-3 rounded-md bg-white/60 dark:bg-neutral-900/60 outline-none', placeholder: 'Digite sua mensagem...' }),
		h('button', { class: 'px-4 rounded-md bg-indigo-600 text-white' }, ['Enviar'])
	]);

	const msgs = await window.turodesk.chats.messages(state.currentId);
	msgs.forEach((m) => messagesList.appendChild(renderMsg(m.role, m.content)));
	messagesWrap.appendChild(messagesList);
	messagesWrap.appendChild(inputRow);
	parent.appendChild(messagesWrap);
}

function renderMarkdownInto(el: Element): void {
	const raw = el.textContent || '';
	const html = DOMPurify.sanitize(marked.parse(raw) as string);
	(el as HTMLElement).innerHTML = html;
}

function renderMsg(role: 'user' | 'assistant' | 'system', content: string): HTMLElement {
	const base = 'px-3 py-2 rounded-lg max-w-[72ch] prose prose-slate dark:prose-invert';
	const cls = role === 'user' ? 'bg-indigo-600 text-white ml-auto prose-invert' : role === 'assistant' ? 'bg-black/5 dark:bg-white/10' : 'bg-amber-100 text-amber-900';
	const el = h('div', { class: `${base} ${cls}` }, []);
	if (role === 'assistant') {
		el.setAttribute('id', 'assistant-stream');
		el.textContent = content;
		renderMarkdownInto(el);
	} else {
		el.textContent = content;
	}
	return el;
}

async function onNewChat(): Promise<void> { state.mode = 'intro'; render(); }
async function onSelect(id: string): Promise<void> { state.currentId = id; state.mode = 'chat'; render(); }
function onSearchChange(e: Event): void { state.search = (e.target as HTMLInputElement).value; render(); }

async function onCreateFromIntro(e: Event): Promise<void> {
	e.preventDefault();
	const input = document.getElementById('intro-input') as HTMLInputElement;
	const value = input.value.trim();
	if (!value) return;
	const session = await window.turodesk.chats.create('Nova conversa');
	state.sessions.unshift(session);
	state.currentId = session.id;
	state.mode = 'chat';
	render();
	const messagesList = document.querySelector('#messages-list')!;
	messagesList.appendChild(renderMsg('user', value));
	messagesList.appendChild(renderMsg('assistant', ''));
	messagesList.scrollTop = messagesList.scrollHeight;
	await window.turodesk.chats.sendStream(session.id, value);
}

async function onSend(e: Event): Promise<void> {
	e.preventDefault();
	const input = (document.getElementById('msg') as HTMLInputElement);
	const value = input.value.trim();
	if (!value) return;
	const messagesList = document.getElementById('messages-list')!;
	messagesList.appendChild(renderMsg('user', value));
	input.value = '';
	messagesList.appendChild(renderMsg('assistant', ''));
	messagesList.scrollTop = messagesList.scrollHeight;
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

window.addEventListener('DOMContentLoaded', () => { boot().catch((err) => console.error(err)); });


