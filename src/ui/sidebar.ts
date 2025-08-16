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
};

export function buildSidebar(props: SidebarProps): HTMLElement {
	const { sessions, currentId, mode } = props;
	const sidebar = h('div', { class: 'w-64 md:w-72 h-full shrink-0 border-r border-black/10 dark:border-white/10 p-3 space-y-3 overflow-y-auto' });
	const header = h('div', { class: 'flex items-center justify-between' }, [
		h('div', { class: 'font-medium text-sm text-slate-500 dark:text-slate-400' }, ['Conversas']),
		h(
			'button',
			{ class: 'px-2 py-1 rounded-md bg-indigo-500 text-white text-sm hover:bg-indigo-600 active:scale-[.99] transition', onclick: props.onNewChat, title: 'Novo chat (N)' },
			['Novo']
		),
	]);

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
	sidebar.appendChild(searchWrap);
	sidebar.appendChild(list);
	return sidebar;
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


