import { h } from './dom';

export type ChatSessionMeta = { id: string; title: string; createdAt: string; updatedAt: string };

export type SidebarProps = {
	sessions: ChatSessionMeta[];
	currentId: string;
	mode: 'intro' | 'chat';
	search: string;
	onNewChat: () => void | Promise<void>;
	onSelect: (id: string) => void | Promise<void>;
	onSearchChange: (value: string) => void | Promise<void>;
	onRename: (id: string) => void | Promise<void>;
	onDelete: (id: string) => void | Promise<void>;
	// controle de abrir/fechar
	onToggleSidebar: () => void | Promise<void>;
	isOpen: boolean;
};

export function buildSidebar(props: SidebarProps): HTMLElement {
	const { sessions, currentId, mode } = props;
	const sidebar = h('div', { class: 'w-64 md:w-72 h-full shrink-0 border-r border-black/10 dark:border-white/10 p-3 pt-10 space-y-3 overflow-y-auto' });
	const leftHeader = h('div', { class: 'flex items-center gap-2' }, [
		buildToggleButton(props),
		h('div', { class: 'font-medium text-sm text-slate-500 dark:text-slate-400 select-none' }, ['Conversas'])
	]);
	const header = h('div', { class: 'flex items-center justify-between' }, [leftHeader]);

	// Botão "+ New chat" acima da barra de pesquisa
	const newChatBtn = h('button', {
		class: 'w-full inline-flex items-center justify-start gap-2 h-9 px-3 rounded-md text-slate-600 dark:text-slate-300 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 active:scale-[.99] transition',
		onclick: props.onNewChat,
		title: 'Novo chat (N)'
	}, [svgPlus(), 'New chat']);

	const searchWrap = h('div', { class: 'relative' }, [
		h('span', { class: 'absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' }, [svgSearch()]),
		h('input', {
			class: 'w-full h-9 pl-9 pr-3 rounded-md bg-white/70 dark:bg-neutral-900/70 outline-none placeholder:text-slate-400',
			placeholder: 'Pesquisar conversas...',
			value: props.search,
			oninput: (e: Event) => props.onSearchChange((e.target as HTMLInputElement).value),
		}),
	]);

	const list = h('div', { class: 'space-y-1' });
	const filtered = sessions.filter((s) => s.title.toLowerCase().includes(props.search.toLowerCase()));
	filtered.forEach((s) => {
		const active = s.id === currentId && mode === 'chat';
		const item = h('div', { class: `group flex items-center justify-between px-3 py-2 rounded-xl ${active ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300' : 'hover:bg-black/5 dark:hover:bg-white/5'}` });
		const textBox = h('div', { class: 'min-w-0 flex-1' }, [
			h('button', { class: 'text-left truncate w-full', onclick: () => props.onSelect(s.id) }, [s.title]),
			h('div', { class: 'text-[11px] text-slate-400 mt-0.5' }, [formatShortDate(s.updatedAt)]),
		]);
		const actions = h('div', { class: 'flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity' }, [
			iconBtn(svgEdit(), () => props.onRename(s.id), 'Renomear'),
			iconBtn(svgTrash(), () => props.onDelete(s.id), 'Apagar'),
		]);
		item.appendChild(textBox);
		item.appendChild(actions);
		list.appendChild(item);
	});

	sidebar.appendChild(header);
	sidebar.appendChild(newChatBtn);
	sidebar.appendChild(searchWrap);
	sidebar.appendChild(list);
	return sidebar;
}

export function buildSidebarRail(
	sessions: ChatSessionMeta[],
	currentId: string,
	onSelect: (id: string) => void | Promise<void>,
	onOpen: () => void | Promise<void>,
	onNewChat: () => void | Promise<void>
): HTMLElement {
	const rail = h('div', { class: 'h-full w-[3.2rem] border-r border-black/10 dark:border-white/10 flex flex-col items-center pt-10 pb-2 gap-2' });
	const menuBtn = h('button', {
		class: 'inline-flex items-center justify-center h-8 w-8 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/10 active:scale-95 transition',
		title: 'Abrir menu (⌘/Ctrl+B)',
		onclick: onOpen
	}, [svgSidebarSymbol()]);
	const newBtn = h('button', {
		class: 'inline-flex items-center justify-center h-8 w-8 rounded-md text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 active:scale-95 transition',
		title: 'Novo chat',
		onclick: onNewChat
	}, [svgPlus()]);
	rail.appendChild(menuBtn);
	rail.appendChild(newBtn);

	const list = h('div', { class: 'mt-2 flex-1 overflow-y-auto flex flex-col items-center gap-1 px-1 w-full' });
	sessions.forEach((s) => {
		const active = s.id === currentId;
		const initial = (s.title || '').trim().charAt(0).toUpperCase() || '#';
		const btn = h('button', {
			class: [
				'inline-flex items-center justify-center h-8 w-8 rounded-md text-xs font-medium transition active:scale-95',
				active ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-100 hover:bg-white/10'
			].join(' '),
			title: s.title,
			onclick: () => onSelect(s.id)
		}, [initial]);
		list.appendChild(btn);
	});
	rail.appendChild(list);
	return rail;
}

function buildToggleButton(props: SidebarProps): HTMLElement {
	const btn = h('button', {
		class: 'inline-flex items-center justify-center relative shrink-0 select-none text-slate-400 border-transparent transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-white/10 hover:text-slate-100 h-8 w-8 rounded-md active:scale-95 group',
		onclick: props.onToggleSidebar,
		'aria-label': 'Sidebar',
		'aria-expanded': String(props.isOpen),
		'aria-haspopup': 'menu',
		'data-testid': 'pin-sidebar-toggle',
		'data-state': props.isOpen ? 'open' : 'closed',
		title: 'Abrir/Fechar menu (⌘/Ctrl+B)'
	});
	const wrap = h('div', { class: 'relative' });
	const primary = h('div', { class: 'flex items-center justify-center group-hover:scale-90 transition scale-100 text-inherit', style: 'width: 20px; height: 20px;' }, [props.isOpen ? svgClose() : svgSidebarSymbol()]);
	const secondary = h('div', { class: 'flex items-center justify-center opacity-0 scale-75 absolute inset-0 transition-all text-slate-300', style: 'width: 20px; height: 20px;' }, [props.isOpen ? svgSidebarSymbol() : svgClose()]);
	wrap.appendChild(primary);
	wrap.appendChild(secondary);
	btn.appendChild(wrap);
	return btn;
}

function svgSidebarSymbol(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 20 20');
	el.setAttribute('fill', 'currentColor');
	el.setAttribute('class', 'shrink-0');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	p.setAttribute('d', 'M16.5 4C17.3284 4 18 4.67157 18 5.5V14.5C18 15.3284 17.3284 16 16.5 16H3.5C2.67157 16 2 15.3284 2 14.5V5.5C2 4.67157 2.67157 4 3.5 4H16.5ZM7 15H16.5C16.7761 15 17 14.7761 17 14.5V5.5C17 5.22386 16.7761 5 16.5 5H7V15ZM3.5 5C3.22386 5 3 5.22386 3 5.5V14.5C3 14.7761 3.22386 15 3.5 15H6V5H3.5Z');
	el.appendChild(p);
	return el as unknown as HTMLElement;
}

function svgClose(): HTMLElement {
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

function svgPlus(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 20 20');
	el.setAttribute('fill', 'currentColor');
	el.setAttribute('class', 'w-5 h-5');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	p.setAttribute('d', 'M10 3C10.4142 3 10.75 3.33579 10.75 3.75V9.25H16.25C16.6642 9.25 17 9.58579 17 10C17 10.3882 16.7051 10.7075 16.3271 10.7461L16.25 10.75H10.75V16.25C10.75 16.6642 10.4142 17 10 17C9.58579 17 9.25 16.6642 9.25 16.25V10.75H3.75C3.33579 10.75 3 10.4142 3 10C3 9.58579 3.33579 9.25 3.75 9.25H9.25V3.75C9.25 3.33579 9.58579 3 10 3Z');
	el.appendChild(p);
	return el as unknown as HTMLElement;
}

function iconBtn(icon: HTMLElement, onclick: () => void, title?: string): HTMLElement {
	return h('button', { class: 'p-1.5 rounded-md bg-slate-200/70 dark:bg-neutral-800/70 hover:bg-slate-200 dark:hover:bg-neutral-700 transition', onclick, title }, [icon]);
}

function svgSearch(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('class', 'w-4 h-4');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	path.setAttribute('stroke-width', '2');
	path.setAttribute('d', 'M21 21l-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z');
	el.appendChild(path);
	return el as unknown as HTMLElement;
}

function svgEdit(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('class', 'w-4 h-4');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	path.setAttribute('stroke-width', '2');
	path.setAttribute('d', 'M11 4h2m-9 9l-1 4 4-1 10-10a2.828 2.828 0 1 0-4-4L3 12z');
	el.appendChild(path);
	return el as unknown as HTMLElement;
}

function svgTrash(): HTMLElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('class', 'w-4 h-4');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	path.setAttribute('stroke-width', '2');
	path.setAttribute('d', 'M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1');
	el.appendChild(path);
	return el as unknown as HTMLElement;
}

function formatShortDate(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
	} catch {
		return '';
	}
}


