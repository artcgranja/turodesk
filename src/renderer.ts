type ChatSessionMeta = { id: string; title: string; createdAt: string; updatedAt: string };

import { h } from './ui/dom';
import { renderMarkdownFromRaw, appendTypingCaret } from './ui/markdown';
import { buildSidebar } from './ui/sidebar';
import { renderHome } from './ui/home';
import { renderChat, renderMsg } from './ui/chat';

const state = {
	currentId: '' as string,
	sessions: [] as ChatSessionMeta[],
	mode: 'intro' as 'intro' | 'chat',
	search: '' as string,
	subscriptionsBound: false,
	sidebarOpen: false as boolean,
	authState: {
		isAuthenticated: false,
		user: null,
		dbUser: null,
	} as {
		isAuthenticated: boolean;
		user: { id: number; login: string; name: string; email: string; avatar_url: string } | null;
		dbUser: { id: string; username?: string; email?: string; created_at: string; updated_at: string } | null;
	},
};

async function boot(): Promise<void> {
	// Load and refresh auth state first (validates saved session)
	state.authState = await window.turodesk.auth.refresh();
	
	state.sessions = await window.turodesk.chats.list();
	state.mode = 'intro';
	// Não seleciona chat por padrão na tela de home
	state.currentId = '';
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
		authState: state.authState,
		onNewChat: onNewChat,
		onSelect: onSelect,
		onSearchChange: (value: string) => { state.search = value; void render(); },
		onRename: onRename,
		onDelete: onDelete,
		onLogin: onLogin,
		onLogout: onLogout,
	});

	// Wrapper do sidebar: overlay no mobile
	const sidebarWrap = h('div', {
		id: 'sidebar-wrap',
		class: [
			'fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out md:static md:w-full',
			state.sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full'
		].join(' ')
	}, [sidebarContentFull]);

	// Overlay clicável apenas em mobile quando aberto
	const overlay = h('div', {
		id: 'sidebar-overlay',
		class: state.sidebarOpen ? 'fixed inset-0 z-30 bg-black/30 md:hidden' : 'hidden',
		onclick: () => { state.sidebarOpen = false; void render(); }
	});

	// Área da direita com topbar arrastável
	const right = h('div', { class: 'h-full overflow-hidden grid grid-rows-[auto_1fr]' });
	const topbar = h('div', {
		class: 'flex items-center justify-between gap-2 h-10 pl-20 pr-2 md:pr-3 border-b border-black/10 dark:border-white/10 bg-slate-50/80 dark:bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/30',
		style: '-webkit-app-region: drag'
	});
	const leftTop = h('div', { class: 'flex items-center gap-2', style: '-webkit-app-region: no-drag' }, [
    // botão com estilo solicitado à esquerda do nome
    h('button', {
        class: 'inline-flex items-center justify-center relative shrink-0 select-none text-slate-400 border-transparent transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-slate-100 h-8 w-8 rounded-md active:scale-95 group',
        onclick: () => { state.sidebarOpen = !state.sidebarOpen; void render(); },
        'aria-label': 'Sidebar',
        'aria-expanded': String(state.sidebarOpen),
        'aria-haspopup': 'menu',
        'data-testid': 'pin-sidebar-toggle',
        'data-state': state.sidebarOpen ? 'open' : 'closed',
        title: 'Alternar menu (⌘/Ctrl+B)'
    }, [
        h('div', { class: 'relative' }, [
            h('div', { class: 'flex items-center justify-center group-hover:scale-90 transition scale-100 text-inherit', style: 'width: 20px; height: 20px;' }, [sidebarSymbolIcon()])
        ])
    ]),
    h('div', { class: 'text-sm font-medium text-slate-700 dark:text-slate-300 select-none' }, [getCurrentTitle()])
]);
	const rightActions = h('div', { class: 'flex items-center gap-1', style: '-webkit-app-region: no-drag' });
	if (state.mode === 'chat' && state.currentId) {
		const menuWrap = h('div', { class: 'relative' });
		const menuBtn = h('button', { class: 'p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition', title: 'Opções' }, [dotsIcon()]);
		const menu = h('div', { class: 'hidden absolute right-0 top-full mt-1 w-40 glass-panel p-1 z-50' });
		menu.appendChild(menuItem('Renomear', () => { void onRename(state.currentId); closeMenu(); }));
		menu.appendChild(menuItem('Apagar', () => { void onDelete(state.currentId); closeMenu(); }));
		function toggleMenu(): void { menu.classList.toggle('hidden'); }
		function closeMenu(): void { menu.classList.add('hidden'); }
		menuBtn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
		window.addEventListener('click', () => closeMenu(), { once: true });
		menuWrap.appendChild(menuBtn);
		menuWrap.appendChild(menu);
		rightActions.appendChild(menuWrap);
	}
	topbar.appendChild(leftTop);
	topbar.appendChild(rightActions);
	const rightBody = h('div', { class: 'h-full overflow-hidden' });
	right.appendChild(topbar);
	right.appendChild(rightBody);

	// Container principal: sem rail quando fechado
	const main = state.sidebarOpen
		? h('div', { class: 'h-screen relative md:grid md:grid-cols-[18rem_1fr] bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100' }, [sidebarWrap, right])
		: h('div', { class: 'h-screen relative bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100' }, [right]);
	app.appendChild(main);
	if (state.sidebarOpen) app.appendChild(overlay);

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
			h('div', { class: 'flex items-center justify-center group-hover:scale-90 transition scale-100 text-inherit', style: 'width: 20px; height: 20px;' }, [sidebarSymbolIcon()]),
			// secondary icon (for subtle hover swap)
			h('div', { class: 'flex items-center justify-center opacity-0 scale-75 absolute inset-0 transition-all text-slate-300', style: 'width: 20px; height: 20px;' }, [sidebarSymbolIcon()])
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

function showInputModal(title: string, placeholder: string, defaultValue: string = ''): Promise<string | null> {
	return new Promise((resolve) => {
		// Create modal overlay
		const overlay = document.createElement('div');
		overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn';
		
		// Create modal content
		const modal = document.createElement('div');
		modal.className = 'bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-full mx-4 shadow-xl border dark:border-gray-700 animate-scaleIn';
		
		// Create form
		const form = document.createElement('form');
		form.innerHTML = `
			<h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">${title}</h3>
			<input 
				type="text" 
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white mb-4 transition-colors"
				placeholder="${placeholder}"
				value="${defaultValue}"
				maxlength="100"
				autofocus
			>
			<div class="flex justify-end space-x-3">
				<button type="button" class="cancel-btn px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
					Cancelar
				</button>
				<button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
					Confirmar
				</button>
			</div>
		`;
		
		const input = form.querySelector('input') as HTMLInputElement;
		const cancelBtn = form.querySelector('.cancel-btn') as HTMLButtonElement;
		const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
		
		// Update submit button state based on input
		const updateSubmitState = () => {
			const hasValue = input.value.trim().length > 0;
			submitBtn.disabled = !hasValue;
			submitBtn.className = hasValue 
				? 'px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors'
				: 'px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded-md cursor-not-allowed transition-colors';
		};
		
		input.addEventListener('input', updateSubmitState);
		updateSubmitState();
		
		// Handle form submission
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			const value = input.value.trim();
			if (!value) return;
			document.body.removeChild(overlay);
			resolve(value);
		});
		
		// Handle cancel
		cancelBtn.addEventListener('click', () => {
			document.body.removeChild(overlay);
			resolve(null);
		});
		
		// Handle escape key
		overlay.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				document.body.removeChild(overlay);
				resolve(null);
			}
		});
		
		// Handle click outside modal
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				document.body.removeChild(overlay);
				resolve(null);
			}
		});
		
		modal.appendChild(form);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);
		
		// Focus input after a brief delay
		setTimeout(() => {
			input.focus();
			input.select();
		}, 100);
	});
}

async function onRename(id: string): Promise<void> {
	const current = state.sessions.find((s) => s.id === id);
	const newTitle = await showInputModal(
		'Renomear Conversa', 
		'Digite o novo nome da conversa', 
		current?.title || ''
	);
	
	if (!newTitle) return;
	
	try {
		const updated = await window.turodesk.chats.rename(id, newTitle);
		const idx = state.sessions.findIndex((s) => s.id === id);
		if (idx >= 0) state.sessions[idx] = updated;
		render();
	} catch (error) {
		console.error('Failed to rename chat:', error);
		// You could show an error modal here if needed
	}
}

async function onLogin(useExternalBrowser: boolean = true): Promise<void> {
	try {
		console.log('Starting GitHub login in external browser...');
		state.authState = await window.turodesk.auth.loginWithGitHub(useExternalBrowser);
		console.log('Login successful:', state.authState.user?.login);
		
		// Refresh sessions after login (user might have different chats)
		state.sessions = await window.turodesk.chats.list();
		render();
	} catch (error) {
		console.error('Login failed:', error);
		// You could show an error modal here
		alert('Login failed: ' + (error as Error).message);
	}
}

async function onLogout(): Promise<void> {
	try {
		await window.turodesk.auth.logout();
		state.authState = await window.turodesk.auth.getState();
		
		// Refresh sessions after logout (back to local user)
		state.sessions = await window.turodesk.chats.list();
		state.currentId = '';
		state.mode = 'intro';
		render();
	} catch (error) {
		console.error('Logout failed:', error);
	}
}

function getCurrentTitle(): string {
	const s = state.sessions.find((x) => x.id === state.currentId);
	return s?.title || 'Turodesk';
}

function menuItem(text: string, onClick: () => void): HTMLElement {
	return h('button', { class: 'w-full text-left text-sm px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10', onclick: onClick }, [text]);
}

function dotsIcon(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'currentColor');
	el.setAttribute('class', 'w-5 h-5');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	p.setAttribute('d', 'M12 6a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z');
	el.appendChild(p);
	return el as unknown as HTMLElement;
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


