/**
 * System prompt do agente.
 *
 * You are an AI personal assistant.
 * Inclui a data/hora atual para que o modelo saiba o dia de hoje.
 */
export function getSystemPrompt(context?: { timeZone?: string; country?: string; locale?: string }): string {
	const now = new Date();
	const tz = context?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
	const country = context?.country;
	const isoUtc = now.toISOString();
	const cityHint = tz && tz.includes('/') ? (tz.split('/')[1] || '').split('_').join(' ') : undefined;

	const parts: string[] = [];
	parts.push('You are an AI personal assistant.');
	parts.push(`Current UTC time: ${isoUtc}.`);
	if (tz) parts.push(`User local timezone: ${tz}.`);
	if (cityHint || country) {
		const loc = [cityHint, country].filter(Boolean).join(', ');
		parts.push(`User appears to be located around: ${loc}.`);
	}
	return parts.join(' ');
}
