import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('turodesk', {
	chats: {
		list: () => ipcRenderer.invoke('chats:list'),
		create: (title?: string) => ipcRenderer.invoke('chats:create', title),
		remove: (id: string) => ipcRenderer.invoke('chats:delete', id),
		rename: (id: string, title: string) => ipcRenderer.invoke('chats:rename', id, title),
		messages: (id: string) => ipcRenderer.invoke('chats:messages', id),
		send: (id: string, input: string) => ipcRenderer.invoke('chats:send', id, input),
		sendStream: (id: string, input: string) => ipcRenderer.invoke('chats:sendStream', id, input),
		onToken: (handler: (data: { id: string; token: string }) => void) => ipcRenderer.on('chats:token', (_e, data) => handler(data)),
		onDone: (handler: (data: { id: string; full: string }) => void) => ipcRenderer.on('chats:done', (_e, data) => handler(data)),
		offToken: (handler: (data: { id: string; token: string }) => void) => ipcRenderer.off('chats:token', handler as any),
		offDone: (handler: (data: { id: string; full: string }) => void) => ipcRenderer.off('chats:done', handler as any),
	},
} as const);


