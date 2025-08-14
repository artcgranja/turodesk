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
			};
		};
	}
}

const state = {
	currentId: '' as string,
	sessions: [] as ChatSessionMeta[],
	mode: 'intro' as 'intro' | 'chat',
};

async function boot(): Promise<void> {
	state.sessions = await window.turodesk.chats.list();
	// Sempre iniciar na tela de introdução
	state.mode = 'intro';
	if (state.sessions.length > 0) {
		state.currentId = state.sessions[0].id;
	}
	render();
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') el.className = v;
		else if (k === 'value') (el as HTMLInputElement).value = v;
		else if (k.startsWith('on') && typeof v === 'function') (el as any)[k.toLowerCase()] = v;
		else el.setAttribute(k, String(v));
	});
	children.forEach((c) => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
	return el;
}

async function render(): Promise<void> {
	const app = document.getElementById('app')!;
	app.innerHTML = '';

	const sidebar = buildSidebar();
	const right = h('div', { class: 'min-h-screen' });

	const main = h('div', { class: 'min-h-screen grid grid-cols-[16rem_1fr] bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100' }, [sidebar, right]);
	app.appendChild(main);

	if (state.mode === 'intro') renderIntroPane(right);
	else await renderChatPane(right);
}

function buildSidebar(): HTMLElement {
	const sidebar = h('div', { class: 'w-64 shrink-0 border-r border-black/10 dark:border-white/10 p-3 space-y-2' });
	const header = h('div', { class: 'flex items-center justify-between' }, [
		h('div', { class: 'font-medium text-sm text-slate-500 dark:text-slate-400' }, ['Conversas']),
		h('button', { class: 'px-2 py-1 rounded-md bg-indigo-500 text-white text-sm', onclick: onNewChat }, ['Novo']),
	]);
	sidebar.appendChild(header);

	const list = h('div', { class: 'space-y-1' });
	state.sessions.forEach((s) => {
		const active = s.id === state.currentId && state.mode === 'chat';
		const item = h('div', { class: `group flex items-center justify-between px-2 py-1 rounded-md ${active ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300' : 'hover:bg-black/5 dark:hover:bg-white/5'}` });
		const btn = h('button', { class: 'text-left flex-1', onclick: () => onSelect(s.id) }, [s.title]);
		const actions = h('div', { class: 'opacity-0 group-hover:opacity-100 transition-opacity flex gap-1' }, [
			h('button', { class: 'text-xs px-1 rounded bg-slate-200 dark:bg-neutral-800', onclick: () => onRename(s.id) }, ['Renomear']),
			h('button', { class: 'text-xs px-1 rounded bg-red-500 text-white', onclick: () => onDelete(s.id) }, ['Apagar']),
		]);
		item.appendChild(btn);
		item.appendChild(actions);
		list.appendChild(item);
	});
	sidebar.appendChild(list);
	return sidebar;
}

function renderIntroPane(parent: HTMLElement): void {
	const wrap = h('div', { class: 'min-h-screen grid place-items-center p-8' }, [
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
	const messagesWrap = h('div', { class: 'min-h-screen grid grid-rows-[1fr_auto]' });
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

function renderMsg(role: 'user' | 'assistant' | 'system', content: string): HTMLElement {
	const base = 'px-3 py-2 rounded-lg max-w-[72ch]';
	const cls = role === 'user' ? 'bg-indigo-600 text-white ml-auto' : role === 'assistant' ? 'bg-black/5 dark:bg-white/10' : 'bg-amber-100 text-amber-900';
	return h('div', { class: `${base} ${cls}` }, [content]);
}

async function onNewChat(): Promise<void> {
	state.mode = 'intro';
	render();
}

async function onSelect(id: string): Promise<void> {
	state.currentId = id;
	state.mode = 'chat';
	render();
}

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
	const res = await window.turodesk.chats.send(session.id, value);
	const messagesList = document.querySelector('#messages-list')!;
	messagesList.appendChild(renderMsg('user', value));
	messagesList.appendChild(renderMsg(res.role, res.content));
}

async function onSend(e: Event): Promise<void> {
	e.preventDefault();
	const input = (document.getElementById('msg') as HTMLInputElement);
	const value = input.value.trim();
	if (!value) return;
	const messagesList = document.getElementById('messages-list')!;
	messagesList.appendChild(renderMsg('user', value));
	input.value = '';
	const res = await window.turodesk.chats.send(state.currentId, value);
	messagesList.appendChild(renderMsg(res.role, res.content));
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

window.addEventListener('DOMContentLoaded', () => {
	boot().catch((err) => console.error(err));
});


