import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('turodesk', {} as Record<string, never>);


