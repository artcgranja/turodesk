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

	// Barra inferior com input estilo Claude (container arredondado, sombra e botões auxiliares)
	const inputBar = h('div', { class: 'p-4 border-t border-black/10 dark:border-white/10' }, [
		h('form', { class: 'chat-container', onsubmit: onFormSubmit }, [
			// Wrapper visual
			h('div', { class: '!box-content flex flex-col bg-white/80 dark:bg-neutral-900/80 mx-2 md:mx-0 items-stretch transition-all duration-200 relative cursor-text z-10 rounded-2xl border border-black/10 dark:border-white/10 shadow-[0_8px_22px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.08)] focus-within:shadow-[0_12px_34px_rgba(0,0,0,0.10)]' }, [
				// Editor
				h('div', { class: 'flex flex-col gap-3.5 m-3.5' }, [
					buildEditor()
				]),
				// Toolbar inferior
				h('div', { class: 'flex gap-2.5 w-full items-center px-3 pb-3' }, [
					// Grupo de botões à esquerda
					h('div', { class: 'relative flex items-center gap-2 shrink min-w-0' }, [
						iconButton(plusIcon(), 'Anexar'),
						iconButton(toolsIcon(), 'Ferramentas')
					]),
					// Espaçador
					h('div', { class: 'flex-1' }, []),
					// Enviar
					h('button', { class: 'inline-flex items-center justify-center h-9 w-9 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 transition', type: 'submit', title: 'Enviar' }, [sendIcon()])
				])
			])
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
		const ed = document.getElementById('msg') as HTMLDivElement;
		const value = (ed?.innerText || '').trim();
		if (!value) return;
		ed.innerHTML = '';
		void props.onSend(value);
	}

	function buildEditor(): HTMLElement {
		const ed = h('div', {
			id: 'msg',
			contenteditable: 'true',
			class: 'min-h-[1.5rem] max-h-96 w-full overflow-y-auto break-words outline-none',
			'aria-label': 'Digite sua mensagem',
			role: 'textbox'
		}) as unknown as HTMLDivElement;
		ed.onkeydown = (ev: KeyboardEvent) => {
			if (ev.key === 'Enter' && !ev.shiftKey) {
				ev.preventDefault();
				submitCurrent();
			}
		};
		return ed;
	}

	function iconButton(icon: HTMLElement, title?: string): HTMLElement {
		return h('button', { class: 'inline-flex items-center justify-center h-8 min-w-8 rounded-lg px-2 text-slate-500 border border-black/10 dark:border-white/10 hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 transition active:scale-95', type: 'button', title }, [icon]);
	}

	function plusIcon(): HTMLElement {
		const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		el.setAttribute('viewBox', '0 0 256 256'); el.setAttribute('width', '16'); el.setAttribute('height', '16'); el.setAttribute('fill', 'currentColor');
		const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z'); el.appendChild(p);
		return el as unknown as HTMLElement;
	}

	function toolsIcon(): HTMLElement {
		const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		el.setAttribute('viewBox', '0 0 256 256'); el.setAttribute('width', '16'); el.setAttribute('height', '16'); el.setAttribute('fill', 'currentColor');
		const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z'); el.appendChild(p);
		return el as unknown as HTMLElement;
	}

	function sendIcon(): HTMLElement {
		const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		el.setAttribute('viewBox', '0 0 256 256'); el.setAttribute('width', '16'); el.setAttribute('height', '16'); el.setAttribute('fill', 'currentColor');
		const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z'); el.appendChild(p);
		return el as unknown as HTMLElement;
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


