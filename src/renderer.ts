type ChatSessionMeta = { id: string; title: string; createdAt: string; updatedAt: string };

import { h } from './ui/dom';
import { renderMarkdownFromRaw, appendTypingCaret } from './ui/markdown';
import { buildSidebar, buildSidebarRail } from './ui/sidebar';
import { renderHome } from './ui/home';
import { renderChat, renderMsg } from './ui/chat';

const state = {
	currentId: '' as string,
	sessions: [] as ChatSessionMeta[],
	mode: 'intro' as 'intro' | 'chat',
	search: '' as string,
	subscriptionsBound: false,
	sidebarOpen: false as boolean,
};

async function boot(): Promise<void> {
	state.sessions = await window.turodesk.chats.list();
	state.mode = 'intro';
	if (state.sessions.length > 0) state.currentId = state.sessions[0].id;
	// Sidebar aberto por padrão em telas >= md (768px), fechado em telas menores
	const mql = window.matchMedia('(min-width: 768px)');
	state.sidebarOpen = mql.matches;
	mql.addEventListener('change', (e) => {
		state.sidebarOpen = e.matches; // abre quando entrar em md, fecha quando sair
		void render();
	});
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
		// adiciona caret de digitação no final do último bloco de conteúdo
		appendTypingCaret(el);
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

	const sidebarContentFull = buildSidebar({
		sessions: state.sessions,
		currentId: state.currentId,
		mode: state.mode,
		search: state.search,
		onNewChat: onNewChat,
		onSelect: onSelect,
		onSearchChange: (value: string) => { state.search = value; void render(); },
		onRename: onRename,
		onDelete: onDelete,
		onToggleSidebar: () => { state.sidebarOpen = !state.sidebarOpen; void render(); },
		isOpen: state.sidebarOpen,
	});
	const sidebarContentRail = buildSidebarRail(
		state.sessions,
		state.currentId,
		onSelect,
		() => { state.sidebarOpen = true; void render(); },
		onNewChat
	);

	// Wrapper do sidebar: overlay no mobile, coluna no desktop
	const sidebarWrap = h('div', {
		id: 'sidebar-wrap',
		class: [
			// Mobile overlay behavior
			'fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:w-full',
			state.sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full',
			// Desktop: sempre visível dentro da grid (largura controlada pela grid)
			'md:block'
		].join(' ')
	}, [state.sidebarOpen ? sidebarContentFull : sidebarContentRail]);

	// Overlay clicável apenas em mobile quando aberto
	const overlay = h('div', {
		id: 'sidebar-overlay',
		class: state.sidebarOpen ? 'fixed inset-0 z-30 bg-black/30 md:hidden' : 'hidden',
		onclick: () => { state.sidebarOpen = false; void render(); }
	});

	// Área da direita simples
	const right = h('div', { class: 'h-full overflow-hidden' });
	const rightBody = right;

	// Container principal: em mobile não usa grid; em desktop vira grid com/sem coluna conforme estado
	const main = h('div', {
		class: [
			'h-screen relative md:grid bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100',
			state.sidebarOpen ? 'md:grid-cols-[18rem_1fr]' : 'md:grid-cols-[3.2rem_1fr]'
		].join(' ')
	}, [sidebarWrap, right]);
	app.appendChild(main);
	app.appendChild(overlay);

	// Botão flutuante para abrir/fechar sidebar (apenas mobile)
	const toggleBtn = h('button', {
		id: 'sidebar-toggle',
		class: 'fixed left-3 bottom-3 md:hidden z-50 inline-flex items-center justify-center relative shrink-0 select-none text-slate-400 border-transparent transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-white/10 hover:text-slate-100 h-8 w-8 rounded-md active:scale-95 group',
		onclick: () => { state.sidebarOpen = !state.sidebarOpen; void render(); },
		"aria-label": 'Sidebar',
		"aria-expanded": String(state.sidebarOpen),
		"aria-haspopup": 'menu',
		"data-testid": 'pin-sidebar-toggle',
		"data-state": state.sidebarOpen ? 'open' : 'closed',
		title: 'Abrir/Fechar menu (⌘/Ctrl+B)'
	}, [
		// inner icon swap
		h('div', { class: 'relative' }, [
			// primary icon
			h('div', { class: 'flex items-center justify-center group-hover:scale-90 transition scale-100 text-inherit', style: 'width: 20px; height: 20px;' }, [state.sidebarOpen ? closeIcon() : sidebarSymbolIcon()]),
			// secondary icon (for subtle hover swap)
			h('div', { class: 'flex items-center justify-center opacity-0 scale-75 absolute inset-0 transition-all text-slate-300', style: 'width: 20px; height: 20px;' }, [state.sidebarOpen ? sidebarSymbolIcon() : closeIcon()])
		])
	]);
	app.appendChild(toggleBtn);

	if (state.mode === 'intro') {
		renderHome(rightBody, { onSubmit: onCreateFromIntroSubmit });
	} else {
		await renderChat(rightBody, {
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

// Atalhos de teclado
window.addEventListener('keydown', (ev: KeyboardEvent) => {
	const isToggle = (ev.key.toLowerCase() === 'b') && (ev.metaKey || ev.ctrlKey);
	const isEsc = ev.key === 'Escape';
	if (isToggle) {
		ev.preventDefault();
		state.sidebarOpen = !state.sidebarOpen;
		void render();
	}
	if (isEsc && state.sidebarOpen && !window.matchMedia('(min-width: 768px)').matches) {
		state.sidebarOpen = false;
		void render();
	}
});

function hamburgerIcon(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('class', 'w-5 h-5');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	path.setAttribute('stroke-width', '2');
	path.setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
	el.appendChild(path);
	return el as unknown as HTMLElement;
}

function closeIcon(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('class', 'w-5 h-5');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	path.setAttribute('stroke-width', '2');
	path.setAttribute('d', 'M6 18L18 6M6 6l12 12');
	el.appendChild(path);
	return el as unknown as HTMLElement;
}

function sidebarSymbolIcon(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 20 20');
	el.setAttribute('fill', 'currentColor');
	el.setAttribute('class', 'shrink-0');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	p.setAttribute('d', 'M16.5 4C17.3284 4 18 4.67157 18 5.5V14.5C18 15.3284 17.3284 16 16.5 16H3.5C2.67157 16 2 15.3284 2 14.5V5.5C2 4.67157 2.67157 4 3.5 4H16.5ZM7 15H16.5C16.7761 15 17 14.7761 17 14.5V5.5C17 5.22386 16.7761 5 16.5 5H7V15ZM3.5 5C3.22386 5 3 5.22386 3 5.5V14.5C3 14.7761 3.22386 15 3.5 15H6V5H3.5Z');
	el.appendChild(p);
	return el as unknown as HTMLElement;
}


