import { ipcMain, WebContents } from 'electron';
import { ChatManager } from './chat/manager';

const manager = new ChatManager();

export function registerIPC(): void {
	ipcMain.handle('chats:list', async () => manager.listSessions());
	ipcMain.handle('chats:create', async (_e, title?: string) => manager.createSession(title));
	ipcMain.handle('chats:delete', async (_e, id: string) => manager.deleteSession(id));
	ipcMain.handle('chats:rename', async (_e, id: string, title: string) => manager.renameSession(id, title));
	ipcMain.handle('chats:messages', async (_e, id: string) => manager.getMessages(id));
	ipcMain.handle('chats:send', async (_e, id: string, input: string) => manager.sendMessage(id, input));

	// User memory APIs removidas

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

	// Authentication handlers
	ipcMain.handle('auth:loginGitHub', async (_e, useExternalBrowser?: boolean) => manager.loginWithGitHub(useExternalBrowser));
	ipcMain.handle('auth:logout', async () => manager.logout());
	ipcMain.handle('auth:getState', () => manager.getAuthState());
	ipcMain.handle('auth:getCurrentUser', () => manager.getCurrentUser());
	ipcMain.handle('auth:refresh', async () => manager.refreshAuthState());
}

export async function cleanup(): Promise<void> {
	await manager.cleanup();
}
