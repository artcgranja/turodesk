type ChatSessionMeta = { id: string; title: string; createdAt: string; updatedAt: string };

declare global {
	interface Window {
		// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
		turodesk: {
			chats: {
				list: () => Promise<ChatSessionMeta[]>;
				create: (title?: string) => Promise<ChatSessionMeta>;
				remove: (id: string) => Promise<void>;
				messages: (id: string) => Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string; createdAt: string }>>;
				send: (id: string, input: string) => Promise<{ role: 'assistant' | 'system' | 'user'; content: string; createdAt: string }>;
			};
		};
	}
}

const state = {
	currentId: '' as string,
	sessions: [] as ChatSessionMeta[],
};

async function boot(): Promise<void> {
	state.sessions = await window.turodesk.chats.list();
	if (state.sessions.length === 0) {
		const s = await window.turodesk.chats.create('Nova conversa');
		state.sessions = [s];
	}
	state.currentId = state.sessions[0].id;
	render();
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') el.className = v;
		else if (k.startsWith('on') && typeof v === 'function') (el as any)[k.toLowerCase()] = v;
		else el.setAttribute(k, String(v));
	});
	children.forEach((c) => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
	return el;
}

async function render(): Promise<void> {
	const app = document.getElementById('app')!;
	app.innerHTML = '';

	const sidebar = h('div', { class: 'w-64 shrink-0 border-r border-black/10 dark:border-white/10 p-3 space-y-2' });
	const header = h('div', { class: 'flex items-center justify-between' }, [
		h('div', { class: 'font-medium text-sm text-slate-500 dark:text-slate-400' }, ['Conversas']),
		h('button', { class: 'px-2 py-1 rounded-md bg-indigo-500 text-white text-sm', onclick: onNewChat }, ['Novo']),
	]);
	sidebar.appendChild(header);

	const list = h('div', { class: 'space-y-1' });
	state.sessions.forEach((s) => {
		const active = s.id === state.currentId;
		list.appendChild(
			h('button', { class: `block w-full text-left px-2 py-1 rounded-md ${active ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300' : 'hover:bg-black/5 dark:hover:bg-white/5'}`, onclick: () => onSelect(s.id) }, [s.title])
		);
	});
	sidebar.appendChild(list);

	const messagesWrap = h('div', { class: 'flex-1 grid grid-rows-[1fr_auto]' });
	const messagesList = h('div', { class: 'p-4 overflow-auto space-y-3' });
	const inputRow = h('form', { class: 'p-3 border-t border-black/10 dark:border-white/10 grid grid-cols-[1fr_auto] gap-2', onsubmit: onSend }, [
		h('input', { id: 'msg', class: 'h-11 px-3 rounded-md bg-white/60 dark:bg-neutral-900/60 outline-none', placeholder: 'Digite sua mensagem...' }),
		h('button', { class: 'px-4 rounded-md bg-indigo-600 text-white' }, ['Enviar'])
	]);

	const main = h('div', { class: 'flex-1 grid grid-cols-[16rem_1fr] min-h-full' }, [sidebar, messagesWrap]);
	app.appendChild(main);

	const msgs = await window.turodesk.chats.messages(state.currentId);
	msgs.forEach((m) => messagesList.appendChild(renderMsg(m.role, m.content)));
	messagesWrap.appendChild(messagesList);
	messagesWrap.appendChild(inputRow);
}

function renderMsg(role: 'user' | 'assistant' | 'system', content: string): HTMLElement {
	const base = 'px-3 py-2 rounded-lg max-w-[72ch]';
	const cls = role === 'user' ? 'bg-indigo-600 text-white ml-auto' : role === 'assistant' ? 'bg-black/5 dark:bg-white/10' : 'bg-amber-100 text-amber-900';
	return h('div', { class: `${base} ${cls}` }, [content]);
}

async function onNewChat(): Promise<void> {
	const s = await window.turodesk.chats.create('Nova conversa');
	state.sessions.unshift(s);
	state.currentId = s.id;
	render();
}

async function onSelect(id: string): Promise<void> {
	state.currentId = id;
	render();
}

async function onSend(e: Event): Promise<void> {
	e.preventDefault();
	const input = (document.getElementById('msg') as HTMLInputElement);
	const value = input.value.trim();
	if (!value) return;
	const messagesList = document.querySelector('#app .grid .p-4')!;
	messagesList.appendChild(renderMsg('user', value));
	input.value = '';
	const res = await window.turodesk.chats.send(state.currentId, value);
	messagesList.appendChild(renderMsg(res.role, res.content));
}

window.addEventListener('DOMContentLoaded', () => {
	boot().catch((err) => console.error(err));
});


