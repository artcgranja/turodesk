import { ipcMain } from 'electron';
import { ChatManager } from './chat/manager';

const manager = new ChatManager();

export function registerIPC(): void {
	ipcMain.handle('chats:list', () => manager.listSessions());
	ipcMain.handle('chats:create', (_e, title?: string) => manager.createSession(title));
	ipcMain.handle('chats:delete', (_e, id: string) => manager.deleteSession(id));
	ipcMain.handle('chats:messages', (_e, id: string) => manager.getMessages(id));
	ipcMain.handle('chats:send', async (_e, id: string, input: string) => manager.sendMessage(id, input));
}
