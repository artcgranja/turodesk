import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function enhanceCodeBlocks(scope: Element | Document = document): void {
	const pres = scope.querySelectorAll('pre > code');
	pres.forEach((codeEl) => {
		const code = codeEl as HTMLElement;
		if (code.closest('.code-block')) return;

		const pre = code.parentElement as HTMLElement;
		const langMatch = (code.className || '').match(/language-([a-z0-9+#-]+)/i);
		const langLabel = (langMatch?.[1] || 'texto').toLowerCase();

		const wrapper = document.createElement('div');
		wrapper.className = 'code-block';

		const header = document.createElement('div');
		header.className = 'code-block-header';

		const title = document.createElement('span');
		title.className = 'code-title';
		title.textContent = langLabel;

		const copyBtn = document.createElement('button');
		copyBtn.className = 'code-copy-btn';
		copyBtn.textContent = 'Copiar';
		copyBtn.onclick = () => {
			const text = code.textContent || '';
			void navigator.clipboard.writeText(text);
			copyBtn.textContent = 'Copiado!';
			setTimeout(() => (copyBtn.textContent = 'Copiar'), 1200);
		};

		header.appendChild(title);
		header.appendChild(copyBtn);

		const body = document.createElement('div');
		body.className = 'code-block-body';

		pre.replaceWith(wrapper);
		body.appendChild(pre);
		wrapper.appendChild(header);
		wrapper.appendChild(body);
	});
}

export function renderMarkdownInto(el: Element): void {
	const raw = el.textContent || '';
	const html = DOMPurify.sanitize(marked.parse(raw) as string);
	(el as HTMLElement).innerHTML = html;
	enhanceCodeBlocks(el);
}

export function renderMarkdownFromRaw(el: Element, raw: string): void {
	const html = DOMPurify.sanitize(marked.parse(raw) as string);
	(el as HTMLElement).innerHTML = html;
	enhanceCodeBlocks(el);
}

export function appendTypingCaret(root: Element): void {
	const caret = document.createElement('span');
	caret.className = 'typing-caret';
	caret.textContent = '|';

	let target: Element | null = (root as HTMLElement).lastElementChild;
	if (!target) {
		root.appendChild(caret);
		return;
	}

	// Se último elemento for PRE, tenta colocar dentro do CODE
	if (target.tagName === 'PRE') {
		const code = target.querySelector('code');
		if (code) target = code;
	}

	// Se for lista, usa o último LI
	if (target.tagName === 'UL' || target.tagName === 'OL') {
		const lastLi = target.lastElementChild as Element | null;
		if (lastLi) target = lastLi;
	}

	// Caso o target não aceite inline, fallback para root
	try {
		target.appendChild(caret);
	} catch {
		root.appendChild(caret);
	}
}


