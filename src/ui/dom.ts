export function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Record<string, any> = {},
	children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') el.className = v;
		else if (k === 'value') (el as HTMLInputElement).value = v;
		else if (k.startsWith('on') && typeof v === 'function') (el as any)[k.toLowerCase()] = v;
		else if (k === 'title') el.setAttribute('title', String(v));
		else if (k === 'style' && typeof v === 'string') (el as HTMLElement).setAttribute('style', v);
		else el.setAttribute(k, String(v));
	});
	children.forEach((c) => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
	return el;
}


