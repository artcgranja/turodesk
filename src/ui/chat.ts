import { h } from './dom';
import { renderMarkdownFromRaw } from './markdown';

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string; createdAt?: string };

export type ChatProps = {
	sessionId: string;
	loadMessages: (id: string) => Promise<ChatMessage[]>;
	onSend: (value: string) => void | Promise<void>;
};

export async function renderChat(parent: HTMLElement, props: ChatProps): Promise<void> {
	const messagesWrap = h('div', { class: 'h-full grid grid-rows-[1fr_auto] overflow-hidden' });
	const messagesList = h('div', { id: 'messages-list', class: 'p-6 overflow-auto space-y-6 chat-container' });

	// Barra inferior em largura total com a borda ocupando toda a tela,
	// mantendo o conteúdo centralizado pelo .chat-container interno
	const inputBar = h('div', { class: 'p-4 border-t border-black/10 dark:border-white/10' }, [
		h('form', { class: 'grid grid-cols-[1fr_auto] gap-2 items-end chat-container', onsubmit: onFormSubmit }, [
			buildTextarea(),
			h('button', { class: 'px-5 h-12 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[.99] transition' }, ['Enviar'])
		])
	]);

	const msgs = await props.loadMessages(props.sessionId);
	msgs.forEach((m) => messagesList.appendChild(renderMsg(m.role, m.content)));
	messagesWrap.appendChild(messagesList);
	messagesWrap.appendChild(inputBar);
	parent.appendChild(messagesWrap);

	function onFormSubmit(e: Event): void {
		e.preventDefault();
		submitCurrent();
	}

	function submitCurrent(): void {
		const ta = document.getElementById('msg') as HTMLTextAreaElement;
		const value = ta.value.trim();
		if (!value) return;
		ta.value = '';
		autoResize(ta);
		void props.onSend(value);
	}

	function buildTextarea(): HTMLElement {
		const ta = h('textarea', {
			id: 'msg',
			class: 'min-h-12 max-h-48 px-4 py-3 rounded-xl bg-white/70 dark:bg-neutral-900/70 outline-none resize-none',
			placeholder: 'Digite sua mensagem... (Shift+Enter para nova linha)'
		}) as HTMLTextAreaElement;
		ta.onkeydown = (ev: KeyboardEvent) => {
			if (ev.key === 'Enter' && !ev.shiftKey) {
				ev.preventDefault();
				submitCurrent();
			}
		};
		ta.oninput = () => autoResize(ta);
		// Ajusta altura inicial
		setTimeout(() => autoResize(ta));
		return ta;
	}

	function autoResize(ta: HTMLTextAreaElement): void {
		ta.style.height = 'auto';
		ta.style.height = Math.min(ta.scrollHeight, 192) + 'px';
	}
}

export function renderMsg(role: 'user' | 'assistant' | 'system', content: string): HTMLElement {
	const base = 'msg-bubble';
	const cls = role === 'user' ? 'msg-user ml-auto' : role === 'assistant' ? 'msg-assistant' : 'bg-amber-100 text-amber-900';
	const el = h('div', { class: `${base} ${cls}` }, []);
	if (role === 'assistant') {
		if (content === '') {
			el.setAttribute('id', 'assistant-stream');
			el.setAttribute('data-raw', '');
			const placeholder = h('div', { class: 'assistant-placeholder text-slate-500 dark:text-slate-400' }, [
				'Digitando',
				h('span', { class: 'typing-dot' }, []),
				h('span', { class: 'typing-dot' }, []),
				h('span', { class: 'typing-dot' }, []),
			]);
			el.appendChild(placeholder);
		} else {
			renderMarkdownFromRaw(el, content);
		}
	} else {
		el.textContent = content;
	}
	return el;
}


