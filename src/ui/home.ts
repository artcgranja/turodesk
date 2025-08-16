import { h } from './dom';

export type HomeProps = {
	onSubmit: (value: string) => void | Promise<void>;
};

export function renderHome(parent: HTMLElement, props: HomeProps): void {
	const wrap = h('div', { class: 'h-full grid place-items-center p-8' }, [
		h('div', { class: 'text-center chat-container' }, [
			h('h1', { class: 'text-4xl font-semibold tracking-tight bg-gradient-to-r from-indigo-500 to-sky-400 bg-clip-text text-transparent' }, ['Turodesk']),
			h('p', { class: 'mt-1 text-slate-500 dark:text-slate-400' }, ['Seu espaço de trabalho rápido e minimalista']),
			h('form', { class: 'mt-6 w-[min(680px,92vw)] mx-auto', onsubmit: onCreateFromIntro }, [
				h('div', { class: 'glass-panel px-4 py-2' }, [
					h('input', { id: 'intro-input', class: 'w-full h-12 bg-transparent outline-none text-base placeholder:text-slate-400', placeholder: 'Digite sua primeira mensagem...', autofocus: true })
				])
			])
		])
	]);
	parent.appendChild(wrap);
	(document.getElementById('intro-input') as HTMLInputElement)?.focus();

	function onCreateFromIntro(e: Event): void {
		e.preventDefault();
		const input = document.getElementById('intro-input') as HTMLInputElement;
		const value = input.value.trim();
		if (!value) return;
		void props.onSubmit(value);
	}
}


