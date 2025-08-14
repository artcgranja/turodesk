import { ipcMain, WebContents } from 'electron';
import { ChatManager } from './chat/manager';

const manager = new ChatManager();

export function registerIPC(): void {
	ipcMain.handle('chats:list', () => manager.listSessions());
	ipcMain.handle('chats:create', (_e, title?: string) => manager.createSession(title));
	ipcMain.handle('chats:delete', (_e, id: string) => manager.deleteSession(id));
	ipcMain.handle('chats:rename', (_e, id: string, title: string) => manager.renameSession(id, title));
	ipcMain.handle('chats:messages', (_e, id: string) => manager.getMessages(id));
	ipcMain.handle('chats:send', async (_e, id: string, input: string) => manager.sendMessage(id, input));

	ipcMain.handle('chats:sendStream', async (e, id: string, input: string) => {
		const wc: WebContents | undefined = e?.sender;
		let full = '';
		const res = await manager.sendMessageStream(id, input, (token) => {
			full += token;
			if (wc && !wc.isDestroyed()) wc.send('chats:token', { id, token });
		});
		if (wc && !wc.isDestroyed()) wc.send('chats:done', { id, full });
		return res;
	});
}
