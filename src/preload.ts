import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('turodesk', {
	chats: {
		list: () => ipcRenderer.invoke('chats:list'),
		create: (title?: string) => ipcRenderer.invoke('chats:create', title),
		remove: (id: string) => ipcRenderer.invoke('chats:delete', id),
		rename: (id: string, title: string) => ipcRenderer.invoke('chats:rename', id, title),
		messages: (id: string) => ipcRenderer.invoke('chats:messages', id),
		send: (id: string, input: string) => ipcRenderer.invoke('chats:send', id, input),
	},
} as const);


