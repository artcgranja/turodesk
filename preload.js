const { contextBridge } = require('electron');

// Exponha APIs seguras aqui quando necessário
contextBridge.exposeInMainWorld('turodesk', {});


