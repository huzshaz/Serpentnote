const DEBUG = true;
const log = DEBUG ? console.log.bind(console) : () => {
};
const warn = DEBUG ? console.warn.bind(console) : () => {
};
const error = console.error.bind(console);
const Theme = {
  get current() {
    return document.documentElement.getAttribute("data-theme") || "light";
  },
  isOLED() {
    return this.current === "oled-black";
  },
  isLight() {
    return this.current === "light";
  },
  set(themeName) {
    document.documentElement.setAttribute("data-theme", themeName);
    localStorage.setItem("theme", themeName);
  },
  getBg() {
    return this.isOLED() ? "#000000" : "#FFFFFF";
  },
  getModalBg() {
    return this.isOLED() ? "rgba(0, 0, 0, 0.98)" : "rgba(250, 250, 250, 0.98)";
  },
  getContentBg() {
    return this.isOLED() ? "#000000" : "#FFFFFF";
  },
  getBorderColor() {
    return this.isOLED() ? "#1E1E1E" : "#E0E0E0";
  }
};
const isElectron = typeof window !== "undefined" && window.electronAPI?.isElectron;
let electronDataPath = null;
const DB_NAME = "SerpentNote";
const DB_VERSION = 1;
const STORE_NAME = "data";
let db = null;
async function initIndexedDB() {
  if (isElectron) return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
}
async function indexedDBSet(key, value) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
async function indexedDBGet(key) {
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
async function initElectronStorage() {
  if (!isElectron) return;
  electronDataPath = "./serpentnote-data";
  await window.electronAPI.mkdir(`${electronDataPath}`);
  await window.electronAPI.mkdir(`${electronDataPath}/images`);
}
async function storageSet(key, value) {
  if (isElectron && electronDataPath) {
    const filePath = `${electronDataPath}/${key}.json`;
    await window.electronAPI.writeFile(filePath, value);
  } else if (db) {
    await indexedDBSet(key, value);
  } else {
    localStorage.setItem(key, value);
  }
}
async function storageGet(key) {
  if (isElectron && electronDataPath) {
    const filePath = `${electronDataPath}/${key}.json`;
    const result = await window.electronAPI.readFile(filePath);
    return result.success ? result.data : null;
  } else if (db) {
    return await indexedDBGet(key);
  } else {
    return localStorage.getItem(key);
  }
}
async function saveImageToElectron(base64Data, filename) {
  if (!isElectron || !electronDataPath) return null;
  try {
    const imagePath = `${electronDataPath}/images/${filename}`;
    await window.electronAPI.writeFile(imagePath, base64Data);
    return imagePath;
  } catch (error2) {
    error2("Failed to save image:", error2);
    return null;
  }
}
async function deleteImageFromElectron(imagePath) {
  if (!isElectron || !electronDataPath) return false;
  try {
    const result = await window.electronAPI.unlink(imagePath);
    return result.success;
  } catch (error2) {
    error2("Failed to delete image:", error2);
    return false;
  }
}
function debounce(func, wait) {
  let timeout = null;
  return function(...args) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => func(...args), wait);
  };
}
function throttle(func, limit) {
  let inThrottle = false;
  let lastArgs = null;
  return function(...args) {
    lastArgs = args;
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      lastArgs = null;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs !== null) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    }
  };
}
function checkStorageQuota() {
  let used = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      used += localStorage[key].length + key.length;
    }
  }
  const available = 10 * 1024 * 1024;
  const percentage = used / available * 100;
  return { used, available, percentage };
}
function showStorageWarning(percentage) {
  if (percentage > 80 && percentage < 95) {
    showToast(`\u26A0\uFE0F Storage ${percentage.toFixed(0)}% full. Consider exporting and clearing old data.`, "warning", 5e3);
  }
}
function showToast(message, type = "info", duration = 3e3) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  const icon = {
    success: "\u2713",
    error: "\u2715",
    warning: "\u26A0",
    info: "\u2139"
  }[type];
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("toast-show");
  });
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, duration);
}
const undoStack = [];
const MAX_UNDO_STACK = 10;
function addUndoAction(action) {
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO_STACK) {
    undoStack.shift();
  }
  showUndoToast();
}
function undo() {
  const action = undoStack.pop();
  if (!action) return;
  if (action.type === "delete-channel") {
    const channel = action.data;
    state.channels.push(channel);
    saveToStorage();
    renderChannelsList();
    renderFilterTags();
    selectChannel(channel.id);
    const message = document.createElement("div");
    message.textContent = `\u2713 Channel "${channel.name}" restored`;
    message.style.position = "fixed";
    message.style.top = "20px";
    message.style.left = "50%";
    message.style.transform = "translateX(-50%)";
    message.style.background = "#34c759";
    message.style.color = "white";
    message.style.padding = "12px 24px";
    message.style.borderRadius = "8px";
    message.style.fontWeight = "600";
    message.style.zIndex = "3001";
    message.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    document.body.appendChild(message);
    setTimeout(() => document.body.removeChild(message), 3e3);
  } else if (action.type === "delete-image") {
    const { channelId, imageUrl, index } = action.data;
    const channel = state.channels.find((c) => c.id === channelId);
    if (channel) {
      channel.images.splice(index, 0, imageUrl);
      saveToStorage();
      renderGallery(channel);
      renderChannelsList();
      const message = document.createElement("div");
      message.textContent = "\u2713 Image restored";
      message.style.position = "fixed";
      message.style.top = "20px";
      message.style.left = "50%";
      message.style.transform = "translateX(-50%)";
      message.style.background = "#34c759";
      message.style.color = "white";
      message.style.padding = "12px 24px";
      message.style.borderRadius = "8px";
      message.style.fontWeight = "600";
      message.style.zIndex = "3001";
      message.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      document.body.appendChild(message);
      setTimeout(() => document.body.removeChild(message), 3e3);
    }
  } else if (action.type === "delete-tag") {
    const { tagName, affectedChannels } = action.data;
    state.tags.push(tagName);
    affectedChannels.forEach((channelData) => {
      const channel = state.channels.find((c) => c.id === channelData.id);
      if (channel) {
        channel.tags = channelData.tags;
      }
    });
    saveToStorage();
    renderExistingTags();
    renderFilterTags();
    renderChannelsList();
    const message = document.createElement("div");
    message.textContent = `\u2713 Tag "${tagName}" restored`;
    message.style.position = "fixed";
    message.style.top = "20px";
    message.style.left = "50%";
    message.style.transform = "translateX(-50%)";
    message.style.background = "#34c759";
    message.style.color = "white";
    message.style.padding = "12px 24px";
    message.style.borderRadius = "8px";
    message.style.fontWeight = "600";
    message.style.zIndex = "3001";
    message.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    document.body.appendChild(message);
    setTimeout(() => document.body.removeChild(message), 3e3);
  }
}
function showUndoToast() {
  const existingToast = document.getElementById("undoToast");
  if (existingToast) {
    document.body.removeChild(existingToast);
  }
  const toast = document.createElement("div");
  toast.id = "undoToast";
  toast.innerHTML = `
        <span>Deleted</span>
        <button id="undoBtn">Undo</button>
    `;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.background = "#2c2c2e";
  toast.style.color = "white";
  toast.style.padding = "12px 16px";
  toast.style.borderRadius = "8px";
  toast.style.fontWeight = "500";
  toast.style.zIndex = "3001";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  toast.style.display = "flex";
  toast.style.gap = "16px";
  toast.style.alignItems = "center";
  const undoBtn = toast.querySelector("#undoBtn");
  undoBtn.style.background = "#0a84ff";
  undoBtn.style.color = "white";
  undoBtn.style.border = "none";
  undoBtn.style.padding = "6px 12px";
  undoBtn.style.borderRadius = "6px";
  undoBtn.style.cursor = "pointer";
  undoBtn.style.fontWeight = "600";
  undoBtn.style.fontSize = "14px";
  undoBtn.addEventListener("click", () => {
    undo();
    document.body.removeChild(toast);
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, 5e3);
}
let state = {
  channels: [],
  tags: [],
  activeChannelId: null,
  activeFilter: "all",
  activeFilters: [],
  theme: "oled-black",
  language: "en",
  searchQuery: "",
  currentTagPage: 0,
  tagsPerPage: 15
};
let autocompleteSelectedIndex = -1;
let autocompleteItems = [];
let customDanbooruTags = [];
const STORAGE_KEYS = {
  CHANNELS: "serpentsBook_channels",
  TAGS: "serpentsBook_tags",
  THEME: "serpentsBook_theme",
  LANGUAGE: "serpentsBook_language",
  DANBOORU_TAGS: "serpentsBook_danbooruTags"
};
const translations = {
  en: {
    name: "English",
    appTitle: "Serpentnote",
    settings: "Settings",
    newChannel: "New Channel",
    manageTags: "Manage Tags",
    filterByTags: "Filter by Tags",
    allChannels: "All Channels",
    channels: "Channels",
    gallery: "Gallery",
    uploadImage: "Upload Image",
    noImages: "No images yet. Double-click or drag & drop to upload!",
    prompt: "Prompt",
    copy: "Copy",
    edit: "Edit",
    delete: "Delete",
    cancel: "Cancel",
    save: "Save",
    channelName: "Channel Name",
    tags: "Tags",
    addTag: "Add tag...",
    createNewTag: "Create New Tag",
    add: "Add",
    theme: "Theme",
    colorTheme: "Color Theme",
    themeDescription: "Choose your preferred visual theme",
    light: "Light",
    oledBlack: "OLED Black",
    language: "Language",
    uiLanguage: "UI Language",
    languageDescription: "Choose your preferred interface language",
    manageDanbooruTags: "Manage Danbooru Tags",
    dataManagement: "Data Management",
    exportData: "Export All Data",
    exportDescription: "Download all channels, prompts, tags, and images as a JSON file",
    exportBtn: "Export",
    importData: "Import Data",
    importDescription: "Import previously exported data (replaces current data)",
    importBtn: "Import",
    clearData: "Clear All Data",
    clearDescription: "Permanently delete all channels, prompts, tags, and images",
    clearBtn: "Clear All",
    statistics: "Statistics",
    totalChannels: "Total Channels",
    totalChannelsDescription: "Number of channels in your library",
    totalTags: "Total Tags",
    totalTagsDescription: "Filter tags for organizing channels",
    customDanbooruTags: "Custom Danbooru Tags",
    customDanbooruTagsDescription: "Custom tags added to autocomplete",
    confirmDeleteChannel: "Are you sure you want to delete this channel?",
    confirmClearData: "Are you sure you want to clear all data? This cannot be undone.",
    confirmDeleteTag: "Are you sure you want to delete this tag?",
    enterNewTagName: "Enter new tag name:",
    yes: "Yes",
    no: "No",
    copiedPrompt: "Prompt copied to clipboard!",
    copiedFailed: "Failed to copy prompt"
  },
  es: {
    name: "Espa\xF1ol",
    appTitle: "Serpentnote",
    settings: "Configuraci\xF3n",
    newChannel: "Nuevo Canal",
    manageTags: "Administrar Etiquetas",
    filterByTags: "Filtrar por Etiquetas",
    allChannels: "Todos los Canales",
    channels: "Canales",
    gallery: "Galer\xEDa",
    uploadImage: "Subir Imagen",
    noImages: "\xA1A\xFAn no hay im\xE1genes. Sube tu primera imagen generada por IA!",
    prompt: "Prompt",
    copy: "Copiar",
    edit: "Editar",
    delete: "Eliminar",
    cancel: "Cancelar",
    save: "Guardar",
    channelName: "Nombre del Canal",
    tags: "Etiquetas",
    addTag: "Agregar etiqueta...",
    createNewTag: "Crear Nueva Etiqueta",
    add: "Agregar",
    theme: "Tema",
    colorTheme: "Tema de Color",
    themeDescription: "Elige tu tema visual preferido",
    light: "Claro",
    oledBlack: "Negro OLED",
    language: "Idioma",
    uiLanguage: "Idioma de la Interfaz",
    languageDescription: "Elige tu idioma de interfaz preferido",
    dataManagement: "Gesti\xF3n de Datos",
    exportData: "Exportar Todos los Datos",
    exportDescription: "Descarga todos los canales, prompts, etiquetas e im\xE1genes como archivo JSON",
    exportBtn: "Exportar Datos",
    importData: "Importar Datos",
    importDescription: "Sube un archivo JSON exportado previamente para restaurar tus datos",
    importBtn: "Importar Datos",
    clearData: "Borrar Todos los Datos",
    clearDescription: "Eliminar permanentemente todos los canales, prompts, etiquetas e im\xE1genes",
    clearBtn: "Borrar Datos",
    statistics: "Estad\xEDsticas",
    totalChannels: "Total de Canales",
    totalChannelsDescription: "N\xFAmero de canales en tu biblioteca",
    totalTags: "Total de Etiquetas",
    totalTagsDescription: "Etiquetas de filtro para organizar canales",
    customDanbooruTags: "Etiquetas Danbooru Personalizadas",
    customDanbooruTagsDescription: "Etiquetas personalizadas agregadas al autocompletado",
    confirmDeleteChannel: "\xBFEst\xE1s seguro de que quieres eliminar este canal?",
    confirmClearData: "\xBFEst\xE1s seguro de que quieres borrar todos los datos? Esto no se puede deshacer.",
    confirmDeleteTag: "\xBFEst\xE1s seguro de que quieres eliminar esta etiqueta?",
    enterNewTagName: "Ingrese el nuevo nombre de la etiqueta:",
    yes: "S\xED",
    no: "No",
    copiedPrompt: "\xA1Prompt copiado al portapapeles!",
    copiedFailed: "Error al copiar el prompt"
  },
  fr: {
    name: "Fran\xE7ais",
    appTitle: "Serpentnote",
    settings: "Param\xE8tres",
    newChannel: "Nouveau Canal",
    manageTags: "G\xE9rer les \xC9tiquettes",
    filterByTags: "Filtrer par \xC9tiquettes",
    allChannels: "Tous les Canaux",
    channels: "Canaux",
    gallery: "Galerie",
    uploadImage: "T\xE9l\xE9charger une Image",
    noImages: "Pas encore d'images. T\xE9l\xE9chargez votre premi\xE8re image g\xE9n\xE9r\xE9e par IA!",
    prompt: "Prompt",
    copy: "Copier",
    edit: "Modifier",
    delete: "Supprimer",
    cancel: "Annuler",
    save: "Enregistrer",
    channelName: "Nom du Canal",
    tags: "\xC9tiquettes",
    addTag: "Ajouter une \xE9tiquette...",
    createNewTag: "Cr\xE9er une Nouvelle \xC9tiquette",
    add: "Ajouter",
    theme: "Th\xE8me",
    colorTheme: "Th\xE8me de Couleur",
    themeDescription: "Choisissez votre th\xE8me visuel pr\xE9f\xE9r\xE9",
    light: "Clair",
    oledBlack: "Noir OLED",
    language: "Langue",
    uiLanguage: "Langue de l'Interface",
    languageDescription: "Choisissez votre langue d'interface pr\xE9f\xE9r\xE9e",
    dataManagement: "Gestion des Donn\xE9es",
    exportData: "Exporter Toutes les Donn\xE9es",
    exportDescription: "T\xE9l\xE9chargez tous les canaux, prompts, \xE9tiquettes et images en fichier JSON",
    exportBtn: "Exporter les Donn\xE9es",
    importData: "Importer des Donn\xE9es",
    importDescription: "T\xE9l\xE9chargez un fichier JSON pr\xE9c\xE9demment export\xE9 pour restaurer vos donn\xE9es",
    importBtn: "Importer des Donn\xE9es",
    clearData: "Effacer Toutes les Donn\xE9es",
    clearDescription: "Supprimer d\xE9finitivement tous les canaux, prompts, \xE9tiquettes et images",
    clearBtn: "Effacer les Donn\xE9es",
    statistics: "Statistiques",
    totalChannels: "Total de Canaux",
    totalChannelsDescription: "Nombre de canaux dans votre biblioth\xE8que",
    totalTags: "Total d'\xC9tiquettes",
    totalTagsDescription: "\xC9tiquettes de filtre pour organiser les canaux",
    customDanbooruTags: "\xC9tiquettes Danbooru Personnalis\xE9es",
    customDanbooruTagsDescription: "\xC9tiquettes personnalis\xE9es ajout\xE9es \xE0 l'autocompl\xE9tion",
    confirmDeleteChannel: "\xCAtes-vous s\xFBr de vouloir supprimer ce canal?",
    confirmClearData: "\xCAtes-vous s\xFBr de vouloir effacer toutes les donn\xE9es? Cette action ne peut pas \xEAtre annul\xE9e.",
    confirmDeleteTag: "\xCAtes-vous s\xFBr de vouloir supprimer cette \xE9tiquette?",
    enterNewTagName: "Entrez le nouveau nom de l'\xE9tiquette:",
    yes: "Oui",
    no: "Non",
    copiedPrompt: "Prompt copi\xE9 dans le presse-papiers!",
    copiedFailed: "\xC9chec de la copie du prompt"
  },
  zh: {
    name: "\u4E2D\u6587",
    appTitle: "Serpentnote",
    settings: "\u8BBE\u7F6E",
    newChannel: "\u65B0\u5EFA\u9891\u9053",
    manageTags: "\u7BA1\u7406\u6807\u7B7E",
    filterByTags: "\u6309\u6807\u7B7E\u7B5B\u9009",
    allChannels: "\u6240\u6709\u9891\u9053",
    channels: "\u9891\u9053",
    gallery: "\u753B\u5ECA",
    uploadImage: "\u4E0A\u4F20\u56FE\u7247",
    noImages: "\u8FD8\u6CA1\u6709\u56FE\u7247\u3002\u4E0A\u4F20\u60A8\u7684\u7B2C\u4E00\u5F20AI\u751F\u6210\u7684\u56FE\u7247\uFF01",
    prompt: "\u63D0\u793A\u8BCD",
    copy: "\u590D\u5236",
    edit: "\u7F16\u8F91",
    delete: "\u5220\u9664",
    cancel: "\u53D6\u6D88",
    save: "\u4FDD\u5B58",
    channelName: "\u9891\u9053\u540D\u79F0",
    tags: "\u6807\u7B7E",
    addTag: "\u6DFB\u52A0\u6807\u7B7E...",
    createNewTag: "\u521B\u5EFA\u65B0\u6807\u7B7E",
    add: "\u6DFB\u52A0",
    theme: "\u4E3B\u9898",
    colorTheme: "\u989C\u8272\u4E3B\u9898",
    themeDescription: "\u9009\u62E9\u60A8\u559C\u6B22\u7684\u89C6\u89C9\u4E3B\u9898",
    light: "\u4EAE\u8272",
    oledBlack: "OLED\u9ED1",
    language: "\u8BED\u8A00",
    uiLanguage: "\u754C\u9762\u8BED\u8A00",
    languageDescription: "\u9009\u62E9\u60A8\u559C\u6B22\u7684\u754C\u9762\u8BED\u8A00",
    dataManagement: "\u6570\u636E\u7BA1\u7406",
    exportData: "\u5BFC\u51FA\u6240\u6709\u6570\u636E",
    exportDescription: "\u5C06\u6240\u6709\u9891\u9053\u3001\u63D0\u793A\u8BCD\u3001\u6807\u7B7E\u548C\u56FE\u7247\u4E0B\u8F7D\u4E3AJSON\u6587\u4EF6",
    exportBtn: "\u5BFC\u51FA\u6570\u636E",
    importData: "\u5BFC\u5165\u6570\u636E",
    importDescription: "\u4E0A\u4F20\u4E4B\u524D\u5BFC\u51FA\u7684JSON\u6587\u4EF6\u4EE5\u6062\u590D\u60A8\u7684\u6570\u636E",
    importBtn: "\u5BFC\u5165\u6570\u636E",
    clearData: "\u6E05\u9664\u6240\u6709\u6570\u636E",
    clearDescription: "\u6C38\u4E45\u5220\u9664\u6240\u6709\u9891\u9053\u3001\u63D0\u793A\u8BCD\u3001\u6807\u7B7E\u548C\u56FE\u7247",
    clearBtn: "\u6E05\u9664\u6570\u636E",
    statistics: "\u7EDF\u8BA1",
    totalChannels: "\u603B\u9891\u9053\u6570",
    totalChannelsDescription: "\u60A8\u7684\u5E93\u4E2D\u7684\u9891\u9053\u6570\u91CF",
    totalTags: "\u603B\u6807\u7B7E\u6570",
    totalTagsDescription: "\u7528\u4E8E\u7EC4\u7EC7\u9891\u9053\u7684\u7B5B\u9009\u6807\u7B7E",
    customDanbooruTags: "\u81EA\u5B9A\u4E49Danbooru\u6807\u7B7E",
    customDanbooruTagsDescription: "\u6DFB\u52A0\u5230\u81EA\u52A8\u5B8C\u6210\u7684\u81EA\u5B9A\u4E49\u6807\u7B7E",
    confirmDeleteChannel: "\u786E\u5B9A\u8981\u5220\u9664\u6B64\u9891\u9053\u5417\uFF1F",
    confirmClearData: "\u786E\u5B9A\u8981\u6E05\u9664\u6240\u6709\u6570\u636E\u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u6D88\u3002",
    confirmDeleteTag: "\u786E\u5B9A\u8981\u5220\u9664\u6B64\u6807\u7B7E\u5417\uFF1F",
    enterNewTagName: "\u8F93\u5165\u65B0\u6807\u7B7E\u540D\u79F0\uFF1A",
    yes: "\u662F",
    no: "\u5426",
    copiedPrompt: "\u63D0\u793A\u8BCD\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01",
    copiedFailed: "\u590D\u5236\u63D0\u793A\u8BCD\u5931\u8D25"
  },
  ja: {
    name: "\u65E5\u672C\u8A9E",
    appTitle: "Serpentnote",
    settings: "\u8A2D\u5B9A",
    newChannel: "\u65B0\u3057\u3044\u30C1\u30E3\u30F3\u30CD\u30EB",
    manageTags: "\u30BF\u30B0\u3092\u7BA1\u7406",
    filterByTags: "\u30BF\u30B0\u3067\u30D5\u30A3\u30EB\u30BF\u30FC",
    allChannels: "\u3059\u3079\u3066\u306E\u30C1\u30E3\u30F3\u30CD\u30EB",
    channels: "\u30C1\u30E3\u30F3\u30CD\u30EB",
    gallery: "\u30AE\u30E3\u30E9\u30EA\u30FC",
    uploadImage: "\u753B\u50CF\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9",
    noImages: "\u307E\u3060\u753B\u50CF\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u6700\u521D\u306EAI\u751F\u6210\u753B\u50CF\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u3066\u304F\u3060\u3055\u3044\uFF01",
    prompt: "\u30D7\u30ED\u30F3\u30D7\u30C8",
    copy: "\u30B3\u30D4\u30FC",
    edit: "\u7DE8\u96C6",
    delete: "\u524A\u9664",
    cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    save: "\u4FDD\u5B58",
    channelName: "\u30C1\u30E3\u30F3\u30CD\u30EB\u540D",
    tags: "\u30BF\u30B0",
    addTag: "\u30BF\u30B0\u3092\u8FFD\u52A0...",
    createNewTag: "\u65B0\u3057\u3044\u30BF\u30B0\u3092\u4F5C\u6210",
    add: "\u8FFD\u52A0",
    theme: "\u30C6\u30FC\u30DE",
    colorTheme: "\u30AB\u30E9\u30FC\u30C6\u30FC\u30DE",
    themeDescription: "\u304A\u597D\u307F\u306E\u30D3\u30B8\u30E5\u30A2\u30EB\u30C6\u30FC\u30DE\u3092\u9078\u629E",
    light: "\u30E9\u30A4\u30C8",
    oledBlack: "OLED\u30D6\u30E9\u30C3\u30AF",
    language: "\u8A00\u8A9E",
    uiLanguage: "\u30A4\u30F3\u30BF\u30FC\u30D5\u30A7\u30FC\u30B9\u8A00\u8A9E",
    languageDescription: "\u304A\u597D\u307F\u306E\u30A4\u30F3\u30BF\u30FC\u30D5\u30A7\u30FC\u30B9\u8A00\u8A9E\u3092\u9078\u629E",
    dataManagement: "\u30C7\u30FC\u30BF\u7BA1\u7406",
    exportData: "\u3059\u3079\u3066\u306E\u30C7\u30FC\u30BF\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8",
    exportDescription: "\u3059\u3079\u3066\u306E\u30C1\u30E3\u30F3\u30CD\u30EB\u3001\u30D7\u30ED\u30F3\u30D7\u30C8\u3001\u30BF\u30B0\u3001\u753B\u50CF\u3092JSON\u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    exportBtn: "\u30C7\u30FC\u30BF\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8",
    importData: "\u30C7\u30FC\u30BF\u3092\u30A4\u30F3\u30DD\u30FC\u30C8",
    importDescription: "\u4EE5\u524D\u306B\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3057\u305FJSON\u30D5\u30A1\u30A4\u30EB\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u3066\u30C7\u30FC\u30BF\u3092\u5FA9\u5143",
    importBtn: "\u30C7\u30FC\u30BF\u3092\u30A4\u30F3\u30DD\u30FC\u30C8",
    clearData: "\u3059\u3079\u3066\u306E\u30C7\u30FC\u30BF\u3092\u30AF\u30EA\u30A2",
    clearDescription: "\u3059\u3079\u3066\u306E\u30C1\u30E3\u30F3\u30CD\u30EB\u3001\u30D7\u30ED\u30F3\u30D7\u30C8\u3001\u30BF\u30B0\u3001\u753B\u50CF\u3092\u5B8C\u5168\u306B\u524A\u9664",
    clearBtn: "\u30C7\u30FC\u30BF\u3092\u30AF\u30EA\u30A2",
    statistics: "\u7D71\u8A08",
    totalChannels: "\u7DCF\u30C1\u30E3\u30F3\u30CD\u30EB\u6570",
    totalChannelsDescription: "\u30E9\u30A4\u30D6\u30E9\u30EA\u5185\u306E\u30C1\u30E3\u30F3\u30CD\u30EB\u6570",
    totalTags: "\u7DCF\u30BF\u30B0\u6570",
    totalTagsDescription: "\u30C1\u30E3\u30F3\u30CD\u30EB\u3092\u6574\u7406\u3059\u308B\u305F\u3081\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u30BF\u30B0",
    customDanbooruTags: "\u30AB\u30B9\u30BF\u30E0Danbooru\u30BF\u30B0",
    customDanbooruTagsDescription: "\u30AA\u30FC\u30C8\u30B3\u30F3\u30D7\u30EA\u30FC\u30C8\u306B\u8FFD\u52A0\u3055\u308C\u305F\u30AB\u30B9\u30BF\u30E0\u30BF\u30B0",
    confirmDeleteChannel: "\u3053\u306E\u30C1\u30E3\u30F3\u30CD\u30EB\u3092\u524A\u9664\u3057\u3066\u3082\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F",
    confirmClearData: "\u3059\u3079\u3066\u306E\u30C7\u30FC\u30BF\u3092\u30AF\u30EA\u30A2\u3057\u3066\u3082\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F\u3053\u306E\u64CD\u4F5C\u306F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002",
    confirmDeleteTag: "\u3053\u306E\u30BF\u30B0\u3092\u524A\u9664\u3057\u3066\u3082\u3088\u308D\u3057\u3044\u3067\u3059\u304B\uFF1F",
    enterNewTagName: "\u65B0\u3057\u3044\u30BF\u30B0\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
    yes: "\u306F\u3044",
    no: "\u3044\u3044\u3048",
    copiedPrompt: "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\uFF01",
    copiedFailed: "\u30D7\u30ED\u30F3\u30D7\u30C8\u306E\u30B3\u30D4\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
  },
  ar: {
    name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
    appTitle: "Serpentnote",
    settings: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A",
    newChannel: "\u0642\u0646\u0627\u0629 \u062C\u062F\u064A\u062F\u0629",
    manageTags: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A",
    filterByTags: "\u062A\u0635\u0641\u064A\u0629 \u062D\u0633\u0628 \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A",
    allChannels: "\u062C\u0645\u064A\u0639 \u0627\u0644\u0642\u0646\u0648\u0627\u062A",
    channels: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A",
    gallery: "\u0627\u0644\u0645\u0639\u0631\u0636",
    uploadImage: "\u062A\u062D\u0645\u064A\u0644 \u0635\u0648\u0631\u0629",
    noImages: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0635\u0648\u0631 \u0628\u0639\u062F. \u0642\u0645 \u0628\u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0644 \u0635\u0648\u0631\u0629 \u062A\u0645 \u0625\u0646\u0634\u0627\u0624\u0647\u0627 \u0628\u0648\u0627\u0633\u0637\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A!",
    prompt: "\u0627\u0644\u0645\u0648\u062C\u0647",
    copy: "\u0646\u0633\u062E",
    edit: "\u062A\u0639\u062F\u064A\u0644",
    delete: "\u062D\u0630\u0641",
    cancel: "\u0625\u0644\u063A\u0627\u0621",
    save: "\u062D\u0641\u0638",
    channelName: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0646\u0627\u0629",
    tags: "\u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A",
    addTag: "\u0625\u0636\u0627\u0641\u0629 \u0639\u0644\u0627\u0645\u0629...",
    createNewTag: "\u0625\u0646\u0634\u0627\u0621 \u0639\u0644\u0627\u0645\u0629 \u062C\u062F\u064A\u062F\u0629",
    add: "\u0625\u0636\u0627\u0641\u0629",
    theme: "\u0627\u0644\u0645\u0638\u0647\u0631",
    colorTheme: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0644\u0648\u0627\u0646",
    themeDescription: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u0638\u0647\u0631 \u0627\u0644\u0645\u0631\u0626\u064A \u0627\u0644\u0645\u0641\u0636\u0644 \u0644\u062F\u064A\u0643",
    light: "\u0641\u0627\u062A\u062D",
    oledBlack: "\u0623\u0633\u0648\u062F OLED",
    language: "\u0627\u0644\u0644\u063A\u0629",
    uiLanguage: "\u0644\u063A\u0629 \u0627\u0644\u0648\u0627\u062C\u0647\u0629",
    languageDescription: "\u0627\u062E\u062A\u0631 \u0644\u063A\u0629 \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0645\u0641\u0636\u0644\u0629 \u0644\u062F\u064A\u0643",
    dataManagement: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    exportData: "\u062A\u0635\u062F\u064A\u0631 \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    exportDescription: "\u062A\u0646\u0632\u064A\u0644 \u062C\u0645\u064A\u0639 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0648\u0627\u0644\u0645\u0648\u062C\u0647\u0627\u062A \u0648\u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A \u0648\u0627\u0644\u0635\u0648\u0631 \u0643\u0645\u0644\u0641 JSON",
    exportBtn: "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    importData: "\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    importDescription: "\u0642\u0645 \u0628\u062A\u062D\u0645\u064A\u0644 \u0645\u0644\u0641 JSON \u062A\u0645 \u062A\u0635\u062F\u064A\u0631\u0647 \u0645\u0633\u0628\u0642\u064B\u0627 \u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A\u0643",
    importBtn: "\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    clearData: "\u0645\u0633\u062D \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    clearDescription: "\u062D\u0630\u0641 \u062C\u0645\u064A\u0639 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0648\u0627\u0644\u0645\u0648\u062C\u0647\u0627\u062A \u0648\u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A \u0648\u0627\u0644\u0635\u0648\u0631 \u0628\u0634\u0643\u0644 \u062F\u0627\u0626\u0645",
    clearBtn: "\u0645\u0633\u062D \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    statistics: "\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A",
    totalChannels: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0642\u0646\u0648\u0627\u062A",
    totalChannelsDescription: "\u0639\u062F\u062F \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0641\u064A \u0645\u0643\u062A\u0628\u062A\u0643",
    totalTags: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A",
    totalTagsDescription: "\u0639\u0644\u0627\u0645\u0627\u062A \u0627\u0644\u0641\u0644\u062A\u0631\u0629 \u0644\u062A\u0646\u0638\u064A\u0645 \u0627\u0644\u0642\u0646\u0648\u0627\u062A",
    customDanbooruTags: "\u0639\u0644\u0627\u0645\u0627\u062A Danbooru \u0627\u0644\u0645\u062E\u0635\u0635\u0629",
    customDanbooruTagsDescription: "\u0639\u0644\u0627\u0645\u0627\u062A \u0645\u062E\u0635\u0635\u0629 \u0645\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A",
    confirmDeleteChannel: "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0623\u0646\u0643 \u062A\u0631\u064A\u062F \u062D\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0642\u0646\u0627\u0629\u061F",
    confirmClearData: "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0623\u0646\u0643 \u062A\u0631\u064A\u062F \u0645\u0633\u062D \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A\u061F \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
    confirmDeleteTag: "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0623\u0646\u0643 \u062A\u0631\u064A\u062F \u062D\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0639\u0644\u0627\u0645\u0629\u061F",
    enterNewTagName: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629:",
    yes: "\u0646\u0639\u0645",
    no: "\u0644\u0627",
    copiedPrompt: "\u062A\u0645 \u0646\u0633\u062E \u0627\u0644\u0645\u0648\u062C\u0647 \u0625\u0644\u0649 \u0627\u0644\u062D\u0627\u0641\u0638\u0629!",
    copiedFailed: "\u0641\u0634\u0644 \u0646\u0633\u062E \u0627\u0644\u0645\u0648\u062C\u0647"
  }
};
let confirmResolve = null;
function t(key) {
  const lang = state.language || "en";
  return translations[lang]?.[key] || translations["en"][key] || key;
}
function updateUILanguage() {
  if (state.language === "en") {
    return;
  }
  const appTitle = document.querySelector(".app-title");
  if (appTitle) appTitle.textContent = t("appTitle");
  const filterByTagsTitle = document.querySelector(".sidebar-section-title");
  if (filterByTagsTitle) filterByTagsTitle.textContent = t("filterByTags");
  const allChannelsBtn = document.querySelector('[data-filter="all"]');
  if (allChannelsBtn) allChannelsBtn.textContent = t("allChannels");
  const channelsTitle = document.querySelectorAll(".sidebar-section-title")[1];
  if (channelsTitle) channelsTitle.textContent = t("channels");
  const newChannelBtn = document.getElementById("newChannelBtn");
  if (newChannelBtn) newChannelBtn.textContent = t("newChannel");
  const galleryTitle = document.querySelector(".gallery-section .section-header h3");
  if (galleryTitle) galleryTitle.textContent = t("gallery");
  const uploadBtn = document.getElementById("uploadImageBtn");
  if (uploadBtn) {
    const btnText = uploadBtn.childNodes[1];
    if (btnText) btnText.textContent = " " + t("uploadImage");
  }
  const promptTitle = document.querySelector(".prompt-section .section-header h3");
  if (promptTitle) promptTitle.textContent = t("prompt");
  const channelModalTitle = document.querySelector("#channelModal .modal-header h2");
  if (channelModalTitle) channelModalTitle.textContent = t("newChannel");
  const channelNameLabel = document.querySelector('label[for="channelNameInput"]');
  if (channelNameLabel) channelNameLabel.textContent = t("channelName");
  const tagsLabel = document.querySelector('label[for="tagInput"]');
  if (tagsLabel) tagsLabel.textContent = t("tags");
  const tagInput = document.getElementById("tagInput");
  if (tagInput) tagInput.placeholder = t("addTag");
  const promptLabel = document.querySelector('label[for="promptInput"]');
  if (promptLabel) promptLabel.textContent = t("prompt");
  const cancelChannelBtn = document.getElementById("cancelChannelBtn");
  if (cancelChannelBtn) cancelChannelBtn.textContent = t("cancel");
  const saveChannelBtn = document.getElementById("saveChannelBtn");
  if (saveChannelBtn) saveChannelBtn.textContent = t("save");
  const tagsModalTitle = document.querySelector("#tagsModal .modal-header h2");
  if (tagsModalTitle) tagsModalTitle.textContent = t("manageTags");
  const createTagLabel = document.querySelector('label[for="newTagInput"]');
  if (createTagLabel) createTagLabel.textContent = t("createNewTag");
  const addTagBtn = document.getElementById("addTagBtn");
  if (addTagBtn) addTagBtn.textContent = t("add");
  const settingsTitle = document.querySelector("#settingsModal .modal-header h2");
  if (settingsTitle) settingsTitle.textContent = t("settings");
  const themeSection = document.querySelectorAll(".settings-section-title")[0];
  if (themeSection) themeSection.textContent = t("theme");
  const colorThemeLabel = document.querySelectorAll(".settings-item label")[0];
  if (colorThemeLabel) colorThemeLabel.textContent = t("colorTheme");
  const themeDesc = document.querySelectorAll(".settings-description")[0];
  if (themeDesc) themeDesc.textContent = t("themeDescription");
  const lightSpan = document.querySelector('[data-theme="light"] span');
  if (lightSpan) lightSpan.textContent = t("light");
  const oledBlackSpan = document.querySelector('[data-theme="oled-black"] span');
  if (oledBlackSpan) oledBlackSpan.textContent = t("oledBlack");
  const languageSection = document.querySelectorAll(".settings-section-title")[1];
  if (languageSection) languageSection.textContent = t("language");
  const uiLanguageLabel = document.querySelectorAll(".settings-item label")[1];
  if (uiLanguageLabel) uiLanguageLabel.textContent = t("uiLanguage");
  const languageDesc = document.querySelectorAll(".settings-description")[1];
  if (languageDesc) languageDesc.textContent = t("languageDescription");
  const customEmojiFontSection = document.querySelectorAll(".settings-section-title")[2];
  if (customEmojiFontSection) customEmojiFontSection.textContent = t("customEmojiFont");
  const uploadEmojiFontLabel = document.querySelectorAll(".settings-item label")[2];
  if (uploadEmojiFontLabel) uploadEmojiFontLabel.textContent = t("uploadEmojiFont");
  const uploadEmojiFontDesc = document.querySelectorAll(".settings-description")[2];
  if (uploadEmojiFontDesc) uploadEmojiFontDesc.textContent = t("uploadEmojiFontDescription");
  const dataManagementSection = document.querySelectorAll(".settings-section-title")[3];
  if (dataManagementSection) dataManagementSection.textContent = t("dataManagement");
  const exportDataLabel = document.querySelectorAll(".settings-item label")[3];
  if (exportDataLabel) exportDataLabel.textContent = t("exportData");
  const exportDesc = document.querySelectorAll(".settings-description")[3];
  if (exportDesc) exportDesc.textContent = t("exportDescription");
  const exportBtn = document.getElementById("exportDataBtn");
  if (exportBtn) exportBtn.textContent = t("exportBtn");
  const importDataLabel = document.querySelectorAll(".settings-item label")[4];
  if (importDataLabel) importDataLabel.textContent = t("importData");
  const importDesc = document.querySelectorAll(".settings-description")[4];
  if (importDesc) importDesc.textContent = t("importDescription");
  const importBtn = document.getElementById("importDataBtn");
  if (importBtn) importBtn.textContent = t("importBtn");
  const clearDataLabel = document.querySelectorAll(".settings-item label")[5];
  if (clearDataLabel) clearDataLabel.textContent = t("clearData");
  const clearDesc = document.querySelectorAll(".settings-description")[5];
  if (clearDesc) clearDesc.textContent = t("clearDescription");
  const clearBtn = document.getElementById("clearDataBtn");
  if (clearBtn) clearBtn.textContent = t("clearBtn");
  const statisticsSection = document.querySelectorAll(".settings-section-title")[4];
  if (statisticsSection) statisticsSection.textContent = t("statistics");
  const totalChannelsLabel = document.querySelectorAll(".settings-item label")[6];
  if (totalChannelsLabel) totalChannelsLabel.textContent = t("totalChannels");
  const totalChannelsDesc = document.querySelectorAll(".settings-description")[6];
  if (totalChannelsDesc) totalChannelsDesc.textContent = t("totalChannelsDescription");
  const totalTagsLabel = document.querySelectorAll(".settings-item label")[7];
  if (totalTagsLabel) totalTagsLabel.textContent = t("totalTags");
  const totalTagsDesc = document.querySelectorAll(".settings-description")[7];
  if (totalTagsDesc) totalTagsDesc.textContent = t("totalTagsDescription");
  const customDanbooruLabel = document.querySelectorAll(".settings-item label")[8];
  if (customDanbooruLabel) customDanbooruLabel.textContent = t("customDanbooruTags");
  const customDanbooruDesc = document.querySelectorAll(".settings-description")[8];
  if (customDanbooruDesc) customDanbooruDesc.textContent = t("customDanbooruTagsDescription");
  const confirmYes = document.getElementById("confirmYes");
  if (confirmYes) confirmYes.textContent = t("yes");
  const confirmNo = document.getElementById("confirmNo");
  if (confirmNo) confirmNo.textContent = t("no");
  const galleryEmpty = document.querySelector(".gallery-empty p");
  if (galleryEmpty) galleryEmpty.textContent = t("noImages");
}
function customConfirm(message, okText = "Delete", cancelText = "Cancel") {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    const modal = document.getElementById("confirmModal");
    const messageEl = document.getElementById("confirmMessage");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    messageEl.textContent = message;
    if (okBtn) okBtn.textContent = okText;
    if (cancelBtn) cancelBtn.textContent = cancelText;
    modal.classList.add("active");
  });
}
function closeConfirmModal(result) {
  const modal = document.getElementById("confirmModal");
  modal.classList.remove("active");
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}
let promptResolve = null;
function customPrompt(message, defaultValue = "") {
  return new Promise((resolve) => {
    promptResolve = resolve;
    const modal = document.getElementById("promptModal");
    const messageEl = document.getElementById("promptMessage");
    const inputEl = document.getElementById("promptInput");
    messageEl.textContent = message;
    inputEl.value = defaultValue;
    modal.classList.add("active");
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 100);
  });
}
function closePromptModal(result) {
  const modal = document.getElementById("promptModal");
  modal.classList.remove("active");
  if (promptResolve) {
    promptResolve(result);
    promptResolve = null;
  }
}
function convertToTwemoji(text) {
  return text;
}
async function init() {
  const startTime = Date.now();
  const minLoadingTime = 2e3;
  try {
    log("\u{1F680} Application Starting...");
    if (isElectron) {
      await initElectronStorage();
    } else {
      try {
        await initIndexedDB();
      } catch (error2) {
      }
    }
    await loadFromStorage();
    log("\u2705 Storage loaded:", {
      channels: state.channels.length,
      tags: state.tags.length,
      customDanbooruTags: customDanbooruTags.length,
      theme: state.theme,
      language: state.language
    });
    initTagWorker();
    log("\u2705 Tag worker initialized");
    applyTheme(state.theme);
    log("\u2705 Theme applied:", state.theme);
    applyLanguage(state.language);
    log("\u2705 Language applied:", state.language);
    await loadCustomEmojiFont();
    log("\u2705 Custom emoji font loaded");
    renderChannelsList();
    log("\u2705 Channels list rendered");
    renderFilterTags();
    log("\u2705 Filter tags rendered");
    setupEventListeners();
    log("\u2705 Event listeners setup complete");
    if (state.channels.length === 0) {
      showEmptyState();
      log("\u2705 Empty state shown");
    } else {
      selectChannel(state.channels[0].id);
      log("\u2705 First channel selected:", state.channels[0].name);
    }
    log("\u{1F389} Application initialization complete!");
    const elapsedTime = Date.now() - startTime;
    const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
    setTimeout(() => {
      hideInitialLoadingScreen();
    }, remainingTime);
    setTimeout(() => {
      const titleElement = document.querySelector(".top-bar-title");
      if (titleElement) {
        const computedStyle = window.getComputedStyle(titleElement);
        log("\u{1F3AF} POST-INIT Title Check:");
        log("\u{1F4DD} Title computed font-family:", computedStyle.fontFamily);
      }
    }, 100);
  } catch (error2) {
    error2("\u274C Application initialization failed:", error2);
    error2("Error stack:", error2.stack);
    const elapsedTime = Date.now() - startTime;
    const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
    setTimeout(() => {
      hideInitialLoadingScreen();
    }, remainingTime);
  }
}
async function saveToStorage() {
  try {
    showSaveIndicator("saving");
    await storageSet(STORAGE_KEYS.CHANNELS, JSON.stringify(state.channels));
    await storageSet(STORAGE_KEYS.TAGS, JSON.stringify(state.tags));
    await storageSet(STORAGE_KEYS.THEME, state.theme);
    await storageSet(STORAGE_KEYS.LANGUAGE, state.language);
    await storageSet(STORAGE_KEYS.DANBOORU_TAGS, JSON.stringify(customDanbooruTags));
    showSaveIndicator("saved");
    if (!isElectron) {
      const quota = checkStorageQuota();
      showStorageWarning(quota.percentage);
    }
  } catch (e) {
    showSaveIndicator("error");
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      alert("Storage quota exceeded! Your images could not be saved. Please export your data and clear some images to free up space.");
      error("LocalStorage quota exceeded:", e);
    } else {
      error("Error saving to storage:", e);
    }
  }
}
const throttledSave = throttle(saveToStorage, 1e3);
let saveIndicatorTimeout = null;
function showSaveIndicator(status) {
  const indicator = document.getElementById("saveIndicator");
  if (!indicator) return;
  if (saveIndicatorTimeout !== null) {
    clearTimeout(saveIndicatorTimeout);
  }
  indicator.className = "save-indicator show";
  const span = indicator.querySelector("span");
  if (status === "saving") {
    indicator.classList.add("saving");
    if (span) span.textContent = "Saving...";
  } else if (status === "saved") {
    indicator.classList.remove("saving");
    if (span) span.textContent = "Saved";
    saveIndicatorTimeout = window.setTimeout(() => {
      indicator.classList.remove("show");
    }, 2e3);
  } else if (status === "error") {
    indicator.classList.remove("saving");
    indicator.style.background = "rgba(255, 59, 48, 0.15)";
    indicator.style.borderColor = "rgba(255, 59, 48, 0.3)";
    indicator.style.color = "#ff3b30";
    if (span) span.textContent = "Error";
    saveIndicatorTimeout = window.setTimeout(() => {
      indicator.classList.remove("show");
      indicator.style.background = "";
      indicator.style.borderColor = "";
      indicator.style.color = "";
    }, 3e3);
  }
}
function showLoadingOverlay(text = "Processing...") {
  const overlay = document.getElementById("loadingOverlay");
  const textElement = overlay?.querySelector(".loading-text");
  if (overlay) {
    overlay.classList.add("show");
    if (textElement) {
      textElement.textContent = text;
    }
  }
}
function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.classList.remove("show");
  }
}
function hideInitialLoadingScreen() {
  const loadingScreen = document.getElementById("initialLoadingScreen");
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
    setTimeout(() => {
      loadingScreen.remove();
    }, 1100);
  }
}
function showErrorNotification(message, duration = 5e3) {
  const notification = document.createElement("div");
  notification.className = "error-notification";
  notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${message}</span>
        <button class="error-notification-close" onclick="this.parentElement.remove()">\xD7</button>
    `;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add("show"), 10);
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, duration);
}
function showSuccessNotification(message, duration = 3e3) {
  const notification = document.createElement("div");
  notification.className = "success-notification";
  notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${message}</span>
        <button class="success-notification-close" onclick="this.parentElement.remove()">\xD7</button>
    `;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add("show"), 10);
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, duration);
}
async function loadFromStorage() {
  try {
    const channelsData = await storageGet(STORAGE_KEYS.CHANNELS);
    const tagsData = await storageGet(STORAGE_KEYS.TAGS);
    const themeData = await storageGet(STORAGE_KEYS.THEME);
    const languageData = await storageGet(STORAGE_KEYS.LANGUAGE);
    const danbooruTagsData = await storageGet(STORAGE_KEYS.DANBOORU_TAGS);
    if (channelsData) {
      try {
        state.channels = JSON.parse(channelsData);
      } catch (e) {
        error("Failed to parse channels data:", e);
        showErrorNotification("Failed to load channels. Data may be corrupted.");
        state.channels = [];
      }
    }
    if (tagsData) {
      try {
        state.tags = JSON.parse(tagsData);
      } catch (e) {
        error("Failed to parse tags data:", e);
        showErrorNotification("Failed to load tags. Data may be corrupted.");
        state.tags = [];
      }
    }
    if (themeData) {
      state.theme = themeData;
    }
    if (languageData) {
      state.language = languageData;
    }
    if (danbooruTagsData) {
      try {
        customDanbooruTags = JSON.parse(danbooruTagsData);
      } catch (e) {
        error("Failed to parse Danbooru tags data:", e);
        customDanbooruTags = [];
      }
    }
  } catch (e) {
    error("Critical error loading from storage:", e);
    showErrorNotification("Failed to load application data. Please refresh the page.");
  }
}
function setupModalBackdropClose(modalId, closeCallback) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        closeCallback();
      }
    });
  }
}
function setupEventListeners() {
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const hamburgerDropdown = document.getElementById("hamburgerDropdown");
  hamburgerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    hamburgerDropdown?.classList.toggle("active");
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!hamburgerDropdown?.contains(target) && target !== hamburgerBtn) {
      hamburgerDropdown?.classList.remove("active");
    }
  });
  document.getElementById("hamburgerSettingsBtn")?.addEventListener("click", () => {
    hamburgerDropdown?.classList.remove("active");
    openSettingsModal();
  });
  document.getElementById("hamburgerChannelTagBtn")?.addEventListener("click", () => {
    hamburgerDropdown?.classList.remove("active");
    openTagsModal();
  });
  document.getElementById("hamburgerDanbooruBtn")?.addEventListener("click", () => {
    hamburgerDropdown?.classList.remove("active");
    openDanbooruTagManagerModal();
  });
  document.getElementById("hamburgerGalleryBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const totalImages = state.channels.reduce((count, channel) => count + channel.images.length, 0);
    console.log("\u{1F5BC}\uFE0F Gallery button clicked");
    console.log("\u{1F4CA} Total channels:", state.channels.length);
    console.log("\u{1F4F8} Total images:", totalImages);
    if (totalImages === 0) {
      console.log("\u26A0\uFE0F No images found - preventing gallery from opening");
      const galleryBtn = document.getElementById("hamburgerGalleryBtn");
      console.log("\u{1F3AF} Gallery button found:", galleryBtn);
      if (galleryBtn) {
        console.log("\u2795 Adding shake animation via inline style");
        galleryBtn.style.animation = "shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both";
        setTimeout(() => {
          const computedStyle = window.getComputedStyle(galleryBtn);
          console.log("\u{1F3A8} Animation property after setting:", computedStyle.animation);
        }, 10);
        setTimeout(() => {
          galleryBtn.style.animation = "";
          hamburgerDropdown?.classList.remove("active");
          console.log("\u2796 Removed shake animation and closed menu");
        }, 500);
      } else {
        console.log("\u274C Gallery button not found!");
        hamburgerDropdown?.classList.remove("active");
      }
      showErrorNotification("No images in gallery yet. Upload some images first!");
      console.log("\u{1F6D1} Returning early - gallery modal will NOT open");
      return;
    }
    hamburgerDropdown?.classList.remove("active");
    console.log("\u2705 Images found - opening gallery modal");
    openGalleryModal();
  });
  document.getElementById("newChannelBtn")?.addEventListener("click", () => {
    openChannelModal();
  });
  document.getElementById("closeChannelModal")?.addEventListener("click", closeChannelModal);
  document.getElementById("cancelChannelBtn")?.addEventListener("click", closeChannelModal);
  document.getElementById("saveChannelBtn")?.addEventListener("click", saveChannel);
  document.getElementById("addPromptVariantBtn")?.addEventListener("click", addPromptVariant);
  document.getElementById("addNegativePromptVariantBtn")?.addEventListener("click", addNegativePromptVariant);
  document.getElementById("closeTagsModal")?.addEventListener("click", closeTagsModal);
  document.getElementById("addTagBtn")?.addEventListener("click", addNewTag);
  document.getElementById("closeSettingsModal")?.addEventListener("click", closeSettingsModal);
  document.getElementById("closeGalleryModal")?.addEventListener("click", closeGalleryModal);
  document.getElementById("closeDanbooruTagManagerModal")?.addEventListener("click", closeDanbooruTagManagerModal);
  document.getElementById("exportDataBtn")?.addEventListener("click", exportData);
  document.getElementById("importDataBtn")?.addEventListener("click", () => {
    document.getElementById("importFileInput")?.click();
  });
  document.getElementById("clearDataBtn")?.addEventListener("click", clearAllData);
  document.getElementById("importFileInput")?.addEventListener("change", importData);
  document.getElementById("uploadEmojiFontBtn")?.addEventListener("click", () => {
    document.getElementById("emojiFileInput")?.click();
  });
  document.getElementById("emojiFileInput")?.addEventListener("change", handleEmojiFontUpload);
  document.getElementById("resetEmojiFontBtn")?.addEventListener("click", resetEmojiFont);
  document.addEventListener("contextmenu", (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      log("\u{1F5B1}\uFE0F Right-click on text field");
      const clickX = e.clientX;
      const clickY = e.clientY;
      log("\u{1F4CD} Click position:", clickX, clickY);
      const text = target.value;
      let closestPos = 0;
      let closestDistance = Infinity;
      for (let i = 0; i <= text.length; i++) {
        const coords = getCaretCoordinates(target, i);
        const distance = Math.sqrt(
          Math.pow(coords.x - clickX, 2) + Math.pow(coords.y - clickY, 2)
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPos = i;
        }
      }
      log("\u{1F4CD} Closest character position:", closestPos);
      log("\u{1F4DD} Text:", text);
      const emoji = getEmojiAtPosition(text, closestPos);
      log("\u{1F600} Emoji found:", emoji);
      if (emoji) {
        e.preventDefault();
        log("\u{1F4CF} Getting emoji coordinates...");
        const coords = getCaretCoordinates(target, closestPos);
        log("\u{1F4CD} Emoji coords:", coords);
        showEmojiVariantMenu(emoji, coords.x, coords.y, target);
      } else {
        log("\u274C No emoji found at clicked position");
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "v" || e.key === "V") && (e.ctrlKey && e.shiftKey || e.altKey)) {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const cursorPos = target.selectionStart || 0;
        const text = target.value;
        const emoji = getEmojiAtPosition(text, cursorPos);
        if (emoji) {
          e.preventDefault();
          const rect = target.getBoundingClientRect();
          const x = rect.left + 20;
          const y = rect.top + 40;
          showEmojiVariantMenu(emoji, x, y, target);
        }
      }
    }
  });
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("emojiVariantMenu");
    if (menu && emojiVariantMenuActive && !menu.contains(e.target)) {
      hideEmojiVariantMenu();
    }
  });
  document.addEventListener("contextmenu", (e) => {
    const menu = document.getElementById("emojiVariantMenu");
    if (menu && emojiVariantMenuActive && !menu.contains(e.target)) {
      hideEmojiVariantMenu();
    }
  });
  const emojiVariantBackdrop = document.getElementById("emojiVariantBackdrop");
  if (emojiVariantBackdrop) {
    emojiVariantBackdrop.addEventListener("click", (e) => {
      e.stopPropagation();
      hideEmojiVariantMenu();
    });
    emojiVariantBackdrop.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideEmojiVariantMenu();
    });
  }
  document.querySelectorAll(".theme-option").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.getAttribute("data-theme");
      if (theme) {
        if (state.theme === theme) {
          shakeElement(button);
        } else {
          selectTheme(theme);
        }
      }
    });
  });
  const languageDropdownBtn = document.getElementById("languageDropdownBtn");
  const languageDropdown = document.getElementById("languageDropdown");
  languageDropdownBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    languageDropdownBtn.classList.toggle("open");
    languageDropdown?.classList.toggle("show");
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!languageDropdown?.contains(target) && target !== languageDropdownBtn) {
      languageDropdownBtn?.classList.remove("open");
      languageDropdown?.classList.remove("show");
    }
  });
  document.querySelectorAll(".language-option").forEach((button) => {
    button.addEventListener("click", () => {
      const lang = button.getAttribute("data-lang");
      if (lang) {
        if (state.language === lang) {
          shakeElement(button);
        } else {
          selectLanguage(lang);
          languageDropdownBtn?.classList.remove("open");
          languageDropdown?.classList.remove("show");
        }
      }
    });
  });
  document.getElementById("tagInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTagToChannel();
    }
  });
  document.getElementById("newTagInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewTag();
    }
  });
  const emojiPickerBtn = document.getElementById("emojiPickerBtn");
  const emojiPicker = document.getElementById("emojiPicker");
  let selectedEmojiIndex = -1;
  emojiPickerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = emojiPicker.style.display === "block";
    if (isVisible) {
      emojiPicker.style.display = "none";
      selectedEmojiIndex = -1;
    } else {
      const rect = emojiPickerBtn.getBoundingClientRect();
      emojiPicker.style.top = `${rect.bottom + 8}px`;
      emojiPicker.style.left = `${rect.left}px`;
      emojiPicker.style.display = "block";
      selectedEmojiIndex = -1;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (emojiPicker && emojiPicker.style.display === "block") {
      const activeGrid = Array.from(document.querySelectorAll(".emoji-grid")).find(
        (grid) => grid.style.display === "grid"
      );
      if (!activeGrid) return;
      const emojiOptions = Array.from(activeGrid.querySelectorAll(".emoji-option"));
      const gridColumns = 6;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        selectedEmojiIndex = Math.min(selectedEmojiIndex + 1, emojiOptions.length - 1);
        highlightEmoji(emojiOptions, selectedEmojiIndex);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        selectedEmojiIndex = Math.max(selectedEmojiIndex - 1, 0);
        highlightEmoji(emojiOptions, selectedEmojiIndex);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedEmojiIndex = Math.min(selectedEmojiIndex + gridColumns, emojiOptions.length - 1);
        highlightEmoji(emojiOptions, selectedEmojiIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedEmojiIndex = Math.max(selectedEmojiIndex - gridColumns, 0);
        highlightEmoji(emojiOptions, selectedEmojiIndex);
      } else if (e.key === "Enter" && selectedEmojiIndex >= 0) {
        e.preventDefault();
        emojiOptions[selectedEmojiIndex].click();
      } else if (e.key === "Escape") {
        emojiPicker.style.display = "none";
        selectedEmojiIndex = -1;
      }
    }
  });
  function highlightEmoji(options, index) {
    options.forEach((opt, i) => {
      if (i === index) {
        opt.classList.add("emoji-highlighted");
        opt.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        opt.classList.remove("emoji-highlighted");
      }
    });
  }
  document.querySelectorAll(".emoji-category-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      const category = tab.dataset.category;
      document.querySelectorAll(".emoji-category-tab").forEach((t2) => t2.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".emoji-grid").forEach((grid) => {
        const gridCategory = grid.dataset.category;
        if (gridCategory === category) {
          grid.style.display = "grid";
        } else {
          grid.style.display = "none";
        }
      });
    });
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    const variantMenu = document.getElementById("emojiVariantMenu");
    const backdrop = document.getElementById("emojiVariantBackdrop");
    if (variantMenu?.contains(target) || target === backdrop) {
      return;
    }
    if (!emojiPicker?.contains(target) && target !== emojiPickerBtn && !emojiVariantMenuActive) {
      emojiPicker.style.display = "none";
    }
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    const autocomplete = document.getElementById("tagAutocomplete");
    const promptInput = document.getElementById("channelPromptInput");
    if (autocomplete && !autocomplete.contains(target) && target !== promptInput) {
      autocomplete.style.display = "none";
      autocompleteSelectedIndex = -1;
    }
  });
  document.querySelectorAll(".emoji-option").forEach((option) => {
    option.addEventListener("click", (e) => {
      const emoji = option.getAttribute("data-emoji");
      const input = document.getElementById("newTagInput");
      if (emoji && input) {
        input.value = emoji + " " + input.value;
        input.focus();
        emojiPicker.style.display = "none";
      }
    });
    option.addEventListener("contextmenu", (e) => {
      log("\u{1F5B1}\uFE0F Right-click detected on emoji picker option");
      e.preventDefault();
      e.stopPropagation();
      const emoji = option.getAttribute("data-emoji");
      log("\u{1F4DD} Emoji from data-emoji attribute:", emoji);
      if (!emoji) {
        log("\u274C No emoji attribute found");
        return;
      }
      log("\u{1F50D} Checking if emoji has variants...");
      log("\u{1F50D} emojiVariants object exists?", typeof emojiVariants);
      log("\u{1F50D} Has variants for this emoji?", !!emojiVariants[emoji]);
      log("\u{1F50D} Variants:", emojiVariants[emoji]);
      if (emojiVariants[emoji]) {
        log("\u2705 Emoji has variants! Showing menu...");
        const buttonRect = option.getBoundingClientRect();
        log("\u{1F4CD} Emoji button rect:", buttonRect);
        const variantHandler = (selectedVariant) => {
          log("\u{1F3AF} Variant selected:", selectedVariant);
          const input = document.getElementById("newTagInput");
          if (input) {
            input.value = selectedVariant + " " + input.value;
            input.focus();
            emojiPicker.style.display = "none";
          }
          hideEmojiVariantMenu();
        };
        log("\u{1F4CD} Showing variant menu directly under emoji button");
        showEmojiVariantMenuUnderElement(emoji, option, variantHandler);
      } else {
        log("\u2139\uFE0F No variants available for this emoji");
        shakeElement(option);
      }
    });
  });
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (!isInputFocused && e.key === "/" && searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });
  const debouncedSearch = debounce(() => {
    renderChannelsList();
  }, 300);
  searchInput?.addEventListener("input", (e) => {
    const value = e.target.value;
    state.searchQuery = value;
    if (clearSearchBtn) {
      clearSearchBtn.style.display = value ? "flex" : "none";
    }
    debouncedSearch();
  });
  clearSearchBtn?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      state.searchQuery = "";
      clearSearchBtn.style.display = "none";
      searchInput.focus();
      renderChannelsList();
    }
  });
  searchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const value = searchInput.value.trim();
      if (!value) {
        shakeElement(searchInput);
        return;
      }
      const query = value.toLowerCase();
      let filteredChannels = state.channels;
      if (state.activeFilters.length > 0) {
        filteredChannels = filteredChannels.filter(
          (c) => state.activeFilters.every((tag) => c.tags.includes(tag))
        );
      }
      filteredChannels = filteredChannels.filter(
        (c) => c.name.toLowerCase().includes(query) || c.prompt.toLowerCase().includes(query) || c.tags.some((tag) => tag.toLowerCase().includes(query))
      );
      if (filteredChannels.length === 0) {
        shakeElement(searchInput);
      }
    }
  });
  const galleryGridForUpload = document.getElementById("galleryGrid");
  if (galleryGridForUpload) {
    galleryGridForUpload.addEventListener("dblclick", (e) => {
      const target = e.target;
      if (!target.closest(".gallery-item")) {
        e.preventDefault();
        document.getElementById("fileInput")?.click();
      }
    });
    galleryGridForUpload.addEventListener("mousedown", (e) => {
      if (e.detail > 1) {
        e.preventDefault();
      }
    });
    galleryGridForUpload.addEventListener("click", (e) => {
      const target = e.target;
      const deleteBtn2 = target.closest(".btn-delete-gallery-image");
      if (deleteBtn2) {
        e.stopPropagation();
        const index = parseInt(deleteBtn2.getAttribute("data-index") || "0");
        if (state.activeChannelId) {
          const channel = state.channels.find((c) => c.id === state.activeChannelId);
          if (channel) {
            deleteImageFromGallery(channel, index);
          }
        }
        return;
      }
      const galleryItem = target.closest(".gallery-item");
      if (galleryItem && state.activeChannelId) {
        const channel = state.channels.find((c) => c.id === state.activeChannelId);
        if (!channel) return;
        const mouseEvent = e;
        if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
          const imageUrl = galleryItem.getAttribute("data-image-url") || "";
          toggleImageSelection(imageUrl, galleryItem);
        } else {
          const index = parseInt(galleryItem.getAttribute("data-index") || "0");
          openImageModal(channel.images[index], index);
        }
      }
    });
    galleryGridForUpload.addEventListener("keydown", (e) => {
      const target = e.target;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const deleteBtn2 = target.closest(".btn-delete-gallery-image");
        if (deleteBtn2) {
          const index = parseInt(deleteBtn2.getAttribute("data-index") || "0");
          if (state.activeChannelId) {
            const channel = state.channels.find((c) => c.id === state.activeChannelId);
            if (channel) {
              deleteImageFromGallery(channel, index);
            }
          }
          return;
        }
        const galleryItem = target.closest(".gallery-item");
        if (galleryItem && state.activeChannelId) {
          const channel = state.channels.find((c) => c.id === state.activeChannelId);
          if (!channel) return;
          if (e.ctrlKey || e.metaKey) {
            const imageUrl = galleryItem.getAttribute("data-image-url") || "";
            toggleImageSelection(imageUrl, galleryItem);
          } else {
            const index = parseInt(galleryItem.getAttribute("data-index") || "0");
            openImageModal(channel.images[index], index);
          }
        }
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        const galleryItem = target.closest(".gallery-item");
        if (!galleryItem) return;
        const allItems = Array.from(galleryGridForUpload.querySelectorAll(".gallery-item"));
        const currentIndex = allItems.indexOf(galleryItem);
        if (currentIndex === -1) return;
        let nextIndex = currentIndex;
        const itemsPerRow = Math.floor(galleryGridForUpload.offsetWidth / 180);
        switch (e.key) {
          case "ArrowLeft":
            nextIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
            break;
          case "ArrowRight":
            nextIndex = currentIndex < allItems.length - 1 ? currentIndex + 1 : currentIndex;
            break;
          case "ArrowUp":
            nextIndex = currentIndex - itemsPerRow;
            if (nextIndex < 0) nextIndex = currentIndex;
            break;
          case "ArrowDown":
            nextIndex = currentIndex + itemsPerRow;
            if (nextIndex >= allItems.length) nextIndex = currentIndex;
            break;
        }
        if (nextIndex !== currentIndex) {
          e.preventDefault();
          const nextItem = allItems[nextIndex];
          nextItem.focus();
        }
      }
    });
  }
  document.getElementById("compareImagesBtn")?.addEventListener("click", openComparisonModal);
  document.getElementById("closeComparisonModal")?.addEventListener("click", closeComparisonModal);
  document.getElementById("clearComparisonBtn")?.addEventListener("click", clearComparisonSelection);
  setupModalBackdropClose("comparisonModal", closeComparisonModal);
  document.getElementById("addDanbooruTagBtn")?.addEventListener("click", addDanbooruTag);
  document.getElementById("bulkImportBtn")?.addEventListener("click", bulkImportDanbooruTags);
  const danbooruSearchInput = document.getElementById("danbooruSearchInput");
  const clearDanbooruSearchBtn = document.getElementById("clearDanbooruSearchBtn");
  danbooruSearchInput?.addEventListener("input", (e) => {
    const value = e.target.value;
    danbooruSearchQuery = value;
    if (clearDanbooruSearchBtn) {
      clearDanbooruSearchBtn.style.display = value ? "flex" : "none";
    }
    danbooruTagsPage = 0;
    renderDanbooruTags();
  });
  clearDanbooruSearchBtn?.addEventListener("click", () => {
    if (danbooruSearchInput) {
      danbooruSearchInput.value = "";
      danbooruSearchQuery = "";
      clearDanbooruSearchBtn.style.display = "none";
      danbooruSearchInput.focus();
      danbooruTagsPage = 0;
      renderDanbooruTags();
    }
  });
  danbooruSearchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const value = danbooruSearchInput.value.trim();
      if (!value) {
        shakeElement(danbooruSearchInput);
        return;
      }
      const query = value.toLowerCase();
      const hasResults = customDanbooruTags.some(
        (tag) => tag.name.toLowerCase().includes(query)
      );
      if (!hasResults) {
        shakeElement(danbooruSearchInput);
      }
    }
  });
  const danbooruCategorySelect = document.getElementById("danbooruCategorySelect");
  if (danbooruCategorySelect) {
    let previousCategory = danbooruCategorySelect.value;
    danbooruCategorySelect.addEventListener("mousedown", () => {
      previousCategory = danbooruCategorySelect.value;
    });
    danbooruCategorySelect.addEventListener("change", () => {
      if (danbooruCategorySelect.value === previousCategory) {
        shakeElement(danbooruCategorySelect);
      }
      previousCategory = danbooruCategorySelect.value;
    });
  }
  document.getElementById("prevTagPage")?.addEventListener("click", () => {
    if (state.currentTagPage > 0) {
      state.currentTagPage--;
      renderFilterTags();
    }
  });
  document.getElementById("nextTagPage")?.addEventListener("click", () => {
    const totalPages = Math.ceil(state.tags.length / state.tagsPerPage);
    if (state.currentTagPage < totalPages - 1) {
      state.currentTagPage++;
      renderFilterTags();
    }
  });
  document.getElementById("clearFiltersBtn")?.addEventListener("click", () => {
    state.activeFilter = "all";
    state.activeFilters = [];
    renderFilterTags();
    renderChannelsList();
  });
  document.getElementById("newDanbooruTagInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDanbooruTag();
    }
  });
  document.getElementById("fileInput")?.addEventListener("change", handleFileUpload);
  const galleryGrid = document.getElementById("galleryGrid");
  if (galleryGrid) {
    let preventDefaults2 = function(e) {
      e.preventDefault();
      e.stopPropagation();
    };
    var preventDefaults = preventDefaults2;
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      galleryGrid.addEventListener(eventName, preventDefaults2, false);
      document.body.addEventListener(eventName, preventDefaults2, false);
    });
    ["dragenter", "dragover"].forEach((eventName) => {
      galleryGrid.addEventListener(eventName, () => {
        galleryGrid.classList.add("drag-over");
      }, false);
    });
    ["dragleave", "drop"].forEach((eventName) => {
      galleryGrid.addEventListener(eventName, () => {
        galleryGrid.classList.remove("drag-over");
      }, false);
    });
    galleryGrid.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt?.effectAllowed === "move") {
        return;
      }
      const files = dt?.files;
      if (files && files.length > 0) {
        const fileInput = document.getElementById("fileInput");
        if (fileInput) {
          fileInput.files = files;
          handleFileUpload({ target: fileInput });
        }
      }
    }, false);
  }
  document.getElementById("editChannelBtn")?.addEventListener("click", () => {
    if (state.activeChannelId) {
      openChannelModal(state.activeChannelId);
    }
  });
  document.getElementById("exportChannelBtn")?.addEventListener("click", () => {
    if (state.activeChannelId) {
      const channel = state.channels.find((c) => c.id === state.activeChannelId);
      if (channel && !channel.prompt) {
        const btn = document.getElementById("exportChannelBtn");
        if (btn) {
          shakeElement(btn);
        }
        return;
      }
      exportChannel(state.activeChannelId);
    }
  });
  const deleteBtn = document.getElementById("deleteChannelBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!state.activeChannelId) {
        return;
      }
      const confirmDelete = await customConfirm(t("confirmDeleteChannel"));
      if (confirmDelete) {
        deleteChannel(state.activeChannelId);
      }
    });
  }
  document.getElementById("editPromptBtn")?.addEventListener("click", () => {
    if (state.activeChannelId) {
      openChannelModal(state.activeChannelId);
    }
  });
  document.getElementById("prevPromptVariant")?.addEventListener("click", () => {
    navigatePromptVariant("prev");
  });
  document.getElementById("nextPromptVariant")?.addEventListener("click", () => {
    navigatePromptVariant("next");
  });
  document.getElementById("prevNegativePromptVariant")?.addEventListener("click", () => {
    navigateNegativePromptVariant("prev");
  });
  document.getElementById("nextNegativePromptVariant")?.addEventListener("click", () => {
    navigateNegativePromptVariant("next");
  });
  document.getElementById("copyPromptBtn")?.addEventListener("click", () => {
    if (!state.activeChannelId) return;
    const channel = state.channels.find((c) => c.id === state.activeChannelId);
    if (!channel) return;
    const allPrompts = [channel.prompt, ...channel.promptVariants || []];
    const activeIndex = channel.activeVariantIndex || 0;
    const currentPrompt = allPrompts[activeIndex];
    if (!currentPrompt) {
      const btn = document.getElementById("copyPromptBtn");
      if (btn) {
        shakeElement(btn);
      }
      return;
    }
    copyToClipboard(currentPrompt).then((success) => {
      if (success) {
        const btn = document.getElementById("copyPromptBtn");
        if (btn) {
          btn.classList.add("copied");
          const overlay = document.createElement("span");
          overlay.className = "copy-checkmark-overlay";
          overlay.textContent = "\u2705";
          btn.appendChild(overlay);
          setTimeout(() => {
            btn.classList.remove("copied");
            overlay.remove();
          }, 1500);
        }
      } else {
        error("Failed to copy prompt");
      }
    });
  });
  document.getElementById("editNegativePromptBtn")?.addEventListener("click", () => {
    if (state.activeChannelId) {
      openChannelModal(state.activeChannelId);
    }
  });
  document.getElementById("copyNegativePromptBtn")?.addEventListener("click", () => {
    if (!state.activeChannelId) return;
    const channel = state.channels.find((c) => c.id === state.activeChannelId);
    if (!channel) return;
    const allNegativePrompts = [channel.negativePrompt || "", ...channel.negativePromptVariants || []];
    const activeIndex = channel.activeNegativeVariantIndex || 0;
    const currentNegativePrompt = allNegativePrompts[activeIndex];
    if (!currentNegativePrompt) return;
    copyToClipboard(currentNegativePrompt).then((success) => {
      if (success) {
        const btn = document.getElementById("copyNegativePromptBtn");
        if (btn) {
          btn.classList.add("copied");
          const overlay = document.createElement("span");
          overlay.className = "copy-checkmark-overlay";
          overlay.textContent = "\u2705";
          btn.appendChild(overlay);
          setTimeout(() => {
            btn.classList.remove("copied");
            overlay.remove();
          }, 1500);
        }
      } else {
        error("Failed to copy negative prompt");
      }
    });
  });
  document.getElementById("closeImageModal")?.addEventListener("click", closeImageModal);
  document.getElementById("prevImageBtn")?.addEventListener("click", () => navigateImage("prev"));
  document.getElementById("nextImageBtn")?.addEventListener("click", () => navigateImage("next"));
  document.getElementById("closeConfirmModal")?.addEventListener("click", () => closeConfirmModal(false));
  document.getElementById("confirmCancelBtn")?.addEventListener("click", () => closeConfirmModal(false));
  document.getElementById("confirmOkBtn")?.addEventListener("click", () => closeConfirmModal(true));
  document.getElementById("closePromptModal")?.addEventListener("click", () => closePromptModal(null));
  document.getElementById("promptCancelBtn")?.addEventListener("click", () => closePromptModal(null));
  document.getElementById("promptOkBtn")?.addEventListener("click", () => {
    const inputEl = document.getElementById("promptInput");
    closePromptModal(inputEl.value);
  });
  document.getElementById("promptInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const inputEl = e.target;
      closePromptModal(inputEl.value);
    } else if (e.key === "Escape") {
      closePromptModal(null);
    }
  });
  setupModalBackdropClose("channelModal", closeChannelModal);
  setupModalBackdropClose("tagsModal", closeTagsModal);
  setupModalBackdropClose("imageModal", closeImageModal);
  setupModalBackdropClose("confirmModal", () => closeConfirmModal(false));
  setupModalBackdropClose("settingsModal", closeSettingsModal);
  setupModalBackdropClose("galleryModal", closeGalleryModal);
  setupModalBackdropClose("danbooruTagManagerModal", closeDanbooruTagManagerModal);
  const allGalleryGrid = document.getElementById("allGalleryGrid");
  if (allGalleryGrid) {
    allGalleryGrid.addEventListener("click", (e) => {
      const target = e.target;
      const galleryItem = target.closest(".gallery-grid-item");
      if (galleryItem) {
        const channelId = galleryItem.getAttribute("data-channel-id");
        const imageSrc = galleryItem.getAttribute("data-image-src");
        const channel = state.channels.find((c) => c.id === channelId);
        if (channel && imageSrc) {
          const imageIndex = channel.images.indexOf(imageSrc);
          if (imageIndex !== -1) {
            state.activeChannelId = channel.id;
            openedFromGallery = true;
            closeGalleryModal();
            openImageModal(imageSrc, imageIndex);
          }
        }
      }
    });
  }
}
function createChannel(name, prompt, tags) {
  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    name,
    prompt,
    tags,
    images: [],
    createdAt: Date.now()
  };
}
function saveChannel() {
  const nameInput = document.getElementById("channelNameInput");
  const promptInput = document.getElementById("channelPromptInput");
  const negativePromptInput = document.getElementById("channelNegativePromptInput");
  const selectedTags = Array.from(document.querySelectorAll(".selected-tag")).map((tag) => tag.textContent?.replace("\xD7", "").trim() || "");
  if (!nameInput.value.trim()) {
    const saveBtn = document.getElementById("saveChannelBtn");
    if (saveBtn) {
      shakeElement(saveBtn);
    }
    return;
  }
  const modalTitle = document.getElementById("channelModalTitle")?.textContent;
  const isEditing = modalTitle?.includes("Edit");
  if (isEditing && state.activeChannelId) {
    const channel = state.channels.find((c) => c.id === state.activeChannelId);
    if (channel) {
      channel.name = nameInput.value.trim();
      channel.prompt = promptInput.value.trim();
      channel.negativePrompt = negativePromptInput.value.trim();
      channel.tags = selectedTags;
    }
  } else {
    const newChannel = {
      id: Date.now().toString(),
      name: nameInput.value.trim(),
      prompt: promptInput.value.trim(),
      negativePrompt: negativePromptInput.value.trim(),
      tags: selectedTags,
      images: [],
      createdAt: Date.now()
    };
    state.channels.unshift(newChannel);
    state.activeChannelId = newChannel.id;
  }
  saveToStorage();
  renderChannelsList();
  renderFilterTags();
  if (state.activeChannelId) {
    selectChannel(state.activeChannelId);
  }
  closeChannelModal();
}
function deleteChannel(channelId) {
  const channelIndex = state.channels.findIndex((c) => c.id === channelId);
  if (channelIndex === -1) return;
  const deletedChannel = state.channels[channelIndex];
  addUndoAction({
    type: "delete-channel",
    data: { ...deletedChannel },
    timestamp: Date.now()
  });
  state.channels = state.channels.filter((c) => c.id !== channelId);
  if (state.activeChannelId === channelId) {
    state.activeChannelId = null;
    if (state.channels.length > 0) {
      selectChannel(state.channels[0].id);
    } else {
      showEmptyState();
    }
  }
  saveToStorage();
  renderChannelsList();
}
function toggleStar(channelId) {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return;
  channel.starred = !channel.starred;
  throttledSave();
  renderChannelsList();
}
function selectChannel(channelId) {
  state.activeChannelId = channelId;
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) return;
  if (channel.activeVariantIndex === void 0) channel.activeVariantIndex = 0;
  if (channel.activeNegativeVariantIndex === void 0) channel.activeNegativeVariantIndex = 0;
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("channelView").style.display = "block";
  document.getElementById("currentChannelName").textContent = channel.name;
  const tagsContainer = document.getElementById("currentChannelTags");
  tagsContainer.innerHTML = channel.tags.map(
    (tag) => `<span class="channel-tag">${tag}</span>`
  ).join("");
  updatePromptDisplay(channel);
  updateNegativePromptDisplay(channel);
  renderGallery(channel);
  document.querySelectorAll(".channel-item").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("data-id") === channelId);
  });
}
function updatePromptDisplay(channel) {
  const promptText = document.getElementById("promptText");
  const promptVariantNav = document.getElementById("promptVariantNav");
  const promptVariantCounter = document.getElementById("promptVariantCounter");
  const allPrompts = [channel.prompt, ...channel.promptVariants || []];
  const activeIndex = channel.activeVariantIndex || 0;
  promptText.textContent = allPrompts[activeIndex] || "No prompt yet";
  if (allPrompts.length > 1) {
    promptVariantNav.style.display = "flex";
    promptVariantCounter.textContent = `${activeIndex + 1}/${allPrompts.length}`;
  } else {
    promptVariantNav.style.display = "none";
  }
}
function updateNegativePromptDisplay(channel) {
  const negativePromptSection = document.getElementById("negativePromptSection");
  const negativePromptText = document.getElementById("negativePromptText");
  const negativePromptVariantNav = document.getElementById("negativePromptVariantNav");
  const negativePromptVariantCounter = document.getElementById("negativePromptVariantCounter");
  const allNegativePrompts = [channel.negativePrompt || "", ...channel.negativePromptVariants || []];
  const activeIndex = channel.activeNegativeVariantIndex || 0;
  const currentNegativePrompt = allNegativePrompts[activeIndex];
  if (currentNegativePrompt && currentNegativePrompt.trim()) {
    negativePromptSection.style.display = "block";
    negativePromptText.textContent = currentNegativePrompt;
    if (allNegativePrompts.filter((p) => p && p.trim()).length > 1) {
      negativePromptVariantNav.style.display = "flex";
      negativePromptVariantCounter.textContent = `${activeIndex + 1}/${allNegativePrompts.length}`;
    } else {
      negativePromptVariantNav.style.display = "none";
    }
  } else {
    negativePromptSection.style.display = "none";
  }
}
function navigatePromptVariant(direction) {
  if (!state.activeChannelId) return;
  const channel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!channel) return;
  const allPrompts = [channel.prompt, ...channel.promptVariants || []];
  const currentIndex = channel.activeVariantIndex || 0;
  if (direction === "next") {
    channel.activeVariantIndex = (currentIndex + 1) % allPrompts.length;
  } else {
    channel.activeVariantIndex = currentIndex === 0 ? allPrompts.length - 1 : currentIndex - 1;
  }
  updatePromptDisplay(channel);
  throttledSave();
}
function navigateNegativePromptVariant(direction) {
  if (!state.activeChannelId) return;
  const channel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!channel) return;
  const allNegativePrompts = [channel.negativePrompt || "", ...channel.negativePromptVariants || []];
  const currentIndex = channel.activeNegativeVariantIndex || 0;
  if (direction === "next") {
    channel.activeNegativeVariantIndex = (currentIndex + 1) % allNegativePrompts.length;
  } else {
    channel.activeNegativeVariantIndex = currentIndex === 0 ? allNegativePrompts.length - 1 : currentIndex - 1;
  }
  updateNegativePromptDisplay(channel);
  throttledSave();
}
function showEmptyState() {
  document.getElementById("emptyState").style.display = "flex";
  document.getElementById("channelView").style.display = "none";
}
const CHANNELS_BUFFER_SIZE = 20;
let channelsCache = null;
let channelPage = 0;
const CHANNELS_PER_PAGE = 20;
function getChannelsHash(channels) {
  if (channels.length === 0) return "0";
  return `${channels.length}-${channels[0].id}-${channels[channels.length - 1].id}`;
}
function renderChannelsList() {
  const container = document.getElementById("channelsList");
  const currentHash = getChannelsHash(state.channels);
  const filtersKey = state.activeFilters.join(",");
  const queryKey = state.searchQuery || "";
  let sortedChannels;
  if (channelsCache && channelsCache.channelsHash === currentHash && channelsCache.filters.join(",") === filtersKey && channelsCache.query === queryKey) {
    sortedChannels = channelsCache.result;
  } else {
    let filteredChannels = state.channels;
    if (state.activeFilters.length > 0) {
      filteredChannels = state.channels.filter(
        (c) => state.activeFilters.every((tag) => c.tags.includes(tag))
      );
    }
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filteredChannels = filteredChannels.filter(
        (c) => c.name.toLowerCase().includes(query) || c.prompt.toLowerCase().includes(query) || c.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    sortedChannels = [...filteredChannels].sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      if (a.order !== void 0 && b.order !== void 0) return a.order - b.order;
      if (a.order !== void 0) return -1;
      if (b.order !== void 0) return 1;
      return b.createdAt - a.createdAt;
    });
    channelsCache = {
      filters: [...state.activeFilters],
      query: queryKey,
      channelsHash: currentHash,
      result: sortedChannels
    };
  }
  if (sortedChannels.length === 0) {
    container.innerHTML = '<p style="color: var(--cream-dark); font-size: 14px; text-align: center; padding: 20px;">No channels found</p>';
    return;
  }
  const totalPages = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
  const startIndex = channelPage * CHANNELS_PER_PAGE;
  const endIndex = Math.min(startIndex + CHANNELS_PER_PAGE, sortedChannels.length);
  const channelsToRender = sortedChannels.slice(startIndex, endIndex);
  container.innerHTML = channelsToRender.map((channel) => {
    const previewImage = channel.images[0] || "";
    const previewPrompt = channel.prompt || "No prompt yet";
    const isStarred = channel.starred || false;
    return `
            <div class="channel-item ${isStarred ? "starred" : ""}"
                 data-id="${channel.id}"
                 draggable="true">
                <div class="channel-item-header">
                    <div class="drag-handle" title="Drag to reorder">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </div>
                    <div class="channel-item-name">${channel.name}</div>
                    <button class="btn-star" data-id="${channel.id}" title="${isStarred ? "Unstar" : "Star"} channel">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isStarred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                </div>
                <div class="channel-item-preview">
                    ${previewImage ? `<img src="${previewImage}" alt="Preview" class="preview-image">` : ""}
                    <div class="preview-prompt">${previewPrompt}</div>
                </div>
                ${channel.tags.length > 0 ? `
                    <div class="channel-item-tags">
                        ${channel.tags.map((tag) => `<span class="mini-tag">${tag}</span>`).join("")}
                    </div>
                ` : ""}
            </div>
        `;
  }).join("");
  container.querySelectorAll(".channel-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-star")) return;
      if (e.target.closest(".drag-handle")) return;
      const id = item.getAttribute("data-id");
      if (id) selectChannel(id);
    });
  });
  container.querySelectorAll(".btn-star").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (id) toggleStar(id);
    });
  });
  setupChannelDragAndDrop();
  const paginationContainer = document.getElementById("channelsPagination");
  if (paginationContainer) {
    if (sortedChannels.length > CHANNELS_PER_PAGE) {
      const totalPages2 = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
      paginationContainer.innerHTML = `
                <div class="channels-pagination">
                    <button class="btn-channel-nav" id="prevChannelPage">\u2039</button>
                    <span class="channel-page-info">${channelPage + 1} / ${totalPages2}</span>
                    <button class="btn-channel-nav" id="nextChannelPage">\u203A</button>
                </div>
            `;
      document.getElementById("prevChannelPage")?.addEventListener("click", () => {
        const totalPages3 = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
        if (channelPage > 0) {
          channelPage--;
        } else {
          channelPage = totalPages3 - 1;
        }
        renderChannelsList();
      });
      document.getElementById("nextChannelPage")?.addEventListener("click", () => {
        const totalPages3 = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
        if (channelPage < totalPages3 - 1) {
          channelPage++;
        } else {
          channelPage = 0;
        }
        renderChannelsList();
      });
    } else {
      paginationContainer.innerHTML = "";
    }
  }
}
function renderFilterTags() {
  const container = document.getElementById("filterTags");
  const paginationContainer = document.getElementById("tagsPagination");
  const actionsContainer = document.getElementById("tagsActions");
  const totalPages = Math.ceil(state.tags.length / state.tagsPerPage);
  const startIndex = state.currentTagPage * state.tagsPerPage;
  const endIndex = Math.min(startIndex + state.tagsPerPage, state.tags.length);
  const visibleTags = state.tags.slice(startIndex, endIndex);
  const isAllActive = state.activeFilter === "all" && state.activeFilters.length === 0;
  const allButtonHTML = `<button class="tag-filter ${isAllActive ? "active" : ""}" data-tag="all" aria-pressed="${isAllActive}" aria-label="Show all channels">All</button>`;
  const tagButtonsHTML = visibleTags.map((tag) => {
    const isActive = state.activeFilters.includes(tag);
    return `<button class="tag-filter ${isActive ? "active" : ""}" data-tag="${tag}" aria-pressed="${isActive}" aria-label="Filter by ${tag}">${tag}</button>`;
  }).join("");
  container.innerHTML = allButtonHTML + tagButtonsHTML;
  if (state.activeFilters.length > 0) {
    actionsContainer.style.display = "flex";
  } else {
    actionsContainer.style.display = "none";
  }
  if (state.tags.length > state.tagsPerPage) {
    paginationContainer.style.display = "flex";
    const pageInfo = document.getElementById("tagPageInfo");
    pageInfo.textContent = `${state.currentTagPage + 1} / ${totalPages}`;
    const prevBtn = document.getElementById("prevTagPage");
    const nextBtn = document.getElementById("nextTagPage");
    prevBtn.disabled = state.currentTagPage === 0;
    nextBtn.disabled = state.currentTagPage >= totalPages - 1;
  } else {
    paginationContainer.style.display = "none";
  }
  container.querySelectorAll(".tag-filter").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tag = btn.getAttribute("data-tag") || "all";
      if (tag === "all") {
        if (state.activeFilter === "all" && state.activeFilters.length === 0) {
          shakeElement(btn);
          return;
        }
        state.activeFilter = "all";
        state.activeFilters = [];
      } else {
        const index = state.activeFilters.indexOf(tag);
        if (index === -1) {
          state.activeFilters.push(tag);
        } else {
          state.activeFilters.splice(index, 1);
        }
        if (state.activeFilters.length === 0) {
          state.activeFilter = "all";
        } else {
          state.activeFilter = state.activeFilters[0];
        }
      }
      renderFilterTags();
      renderChannelsList();
    });
  });
}
function createGalleryItemElement(img, index, isSelected) {
  const div = document.createElement("div");
  div.className = `gallery-item ${isSelected ? "selected-for-comparison" : ""}`;
  div.setAttribute("data-index", String(index));
  div.setAttribute("data-image-url", img);
  div.style.setProperty("--hover-image", `url(${img})`);
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.setAttribute("aria-label", `Image ${index + 1}${isSelected ? ", selected for comparison" : ""}`);
  const imgElement = document.createElement("img");
  imgElement.src = img;
  imgElement.alt = `Generated image ${index + 1}`;
  imgElement.style.background = "var(--burgundy-light)";
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-delete-gallery-image";
  deleteBtn.setAttribute("data-index", String(index));
  deleteBtn.setAttribute("aria-label", `Delete image ${index + 1}`);
  deleteBtn.title = "Delete image";
  deleteBtn.textContent = "\xD7";
  div.appendChild(imgElement);
  div.appendChild(deleteBtn);
  return div;
}
function setupGalleryLazyLoading(container, channel, sentinel, bufferSize) {
  const sentinelObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        try {
          const currentCount = container.querySelectorAll(".gallery-item").length;
          const nextBatch = channel.images.slice(currentCount, currentCount + bufferSize);
          if (nextBatch.length > 0) {
            nextBatch.forEach((img, idx) => {
              const isSelected = selectedImagesForComparison.includes(img);
              const div = createGalleryItemElement(img, currentCount + idx, isSelected);
              if (div && div instanceof HTMLElement && sentinel && sentinel.parentNode === container) {
                container.insertBefore(div, sentinel);
              } else {
                error("Invalid element for insertBefore:", { div, sentinel, container });
              }
            });
          }
          if (container.querySelectorAll(".gallery-item").length >= channel.images.length) {
            sentinelObserver.disconnect();
            if (sentinel && sentinel.parentNode) {
              sentinel.remove();
            }
          }
        } catch (e) {
          error("Error in lazy loading observer:", e);
          sentinelObserver.disconnect();
        }
      }
    });
  }, { rootMargin: "200px" });
  sentinelObserver.observe(sentinel);
}
function renderGallery(channel) {
  const container = document.getElementById("galleryGrid");
  if (channel.images.length === 0) {
    container.innerHTML = `
            <div class="gallery-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>${translations[state.language || "en"].noImages}</p>
            </div>
        `;
    return;
  }
  const IMAGES_BUFFER_SIZE = 50;
  const imagesToRender = channel.images.length > IMAGES_BUFFER_SIZE ? channel.images.slice(0, IMAGES_BUFFER_SIZE) : channel.images;
  const fragment = document.createDocumentFragment();
  imagesToRender.forEach((img, index) => {
    const isSelected = selectedImagesForComparison.includes(img);
    const div = createGalleryItemElement(img, index, isSelected);
    fragment.appendChild(div);
  });
  container.innerHTML = "";
  container.appendChild(fragment);
  if (channel.images.length > IMAGES_BUFFER_SIZE) {
    const sentinel = document.createElement("div");
    sentinel.className = "gallery-sentinel";
    sentinel.style.gridColumn = "1 / -1";
    sentinel.style.height = "1px";
    container.appendChild(sentinel);
    setupGalleryLazyLoading(container, channel, sentinel, IMAGES_BUFFER_SIZE);
  }
  setupImageDragAndDrop(channel);
}
async function deleteImageFromGallery(channel, index) {
  try {
    const confirmed = await customConfirm("Are you sure you want to delete this image?");
    if (!confirmed) {
      return;
    }
    if (index < 0 || index >= channel.images.length) {
      showErrorNotification("Invalid image index. Please refresh and try again.");
      return;
    }
    const galleryItems = document.querySelectorAll(".gallery-item");
    const itemToDelete = galleryItems[index];
    if (itemToDelete) {
      itemToDelete.classList.add("deleting");
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    channel.images.splice(index, 1);
    saveToStorage();
    renderGallery(channel);
    renderChannelsList();
    showSuccessNotification("Image deleted successfully.");
  } catch (e) {
    error("Failed to delete image:", e);
    showErrorNotification("Failed to delete image. Please try again.");
    const galleryItems = document.querySelectorAll(".gallery-item");
    const itemToDelete = galleryItems[index];
    if (itemToDelete) {
      itemToDelete.classList.remove("deleting");
    }
  }
}
function renderPromptVariantsInModal(channel) {
  const variantsList = document.getElementById("promptVariantsList");
  const variants = channel.promptVariants || [];
  if (variants.length === 0) {
    variantsList.innerHTML = "";
    return;
  }
  variantsList.innerHTML = variants.map((variant, index) => `
        <div class="variant-item" data-index="${index}">
            <span class="variant-label">${index + 2}.</span>
            <span class="variant-text" data-index="${index}" data-type="prompt">${variant}</span>
            <button class="btn-delete-variant" type="button" data-index="${index}" data-type="prompt">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join("");
  variantsList.querySelectorAll(".variant-text").forEach((span) => {
    span.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index") || "0");
      editPromptVariant(channel, index, e.currentTarget);
    });
  });
  variantsList.querySelectorAll(".btn-delete-variant").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index") || "0");
      deletePromptVariant(channel, index);
    });
  });
}
function renderNegativePromptVariantsInModal(channel) {
  const variantsList = document.getElementById("negativePromptVariantsList");
  const variants = channel.negativePromptVariants || [];
  if (variants.length === 0) {
    variantsList.innerHTML = "";
    return;
  }
  variantsList.innerHTML = variants.map((variant, index) => `
        <div class="variant-item" data-index="${index}">
            <span class="variant-label">${index + 2}.</span>
            <span class="variant-text" data-index="${index}" data-type="negative">${variant}</span>
            <button class="btn-delete-variant" type="button" data-index="${index}" data-type="negative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join("");
  variantsList.querySelectorAll(".variant-text").forEach((span) => {
    span.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index") || "0");
      editNegativePromptVariant(channel, index, e.currentTarget);
    });
  });
  variantsList.querySelectorAll(".btn-delete-variant").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index") || "0");
      deleteNegativePromptVariant(channel, index);
    });
  });
}
function addPromptVariant() {
  const promptInput = document.getElementById("channelPromptInput");
  const newVariant = promptInput.value.trim();
  if (!newVariant) {
    const btn = document.getElementById("addPromptVariantBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  const modalTitle = document.getElementById("channelModalTitle")?.textContent;
  const isEditing = modalTitle?.includes("Edit");
  if (isEditing && state.activeChannelId) {
    const channel = state.channels.find((c) => c.id === state.activeChannelId);
    if (channel) {
      if (!channel.promptVariants) {
        channel.promptVariants = [];
      }
      channel.promptVariants.push(newVariant);
      renderPromptVariantsInModal(channel);
    }
  } else {
    alert("Please save the channel first before adding variants");
  }
}
function addNegativePromptVariant() {
  const negativePromptInput = document.getElementById("channelNegativePromptInput");
  const newVariant = negativePromptInput.value.trim();
  if (!newVariant) {
    const btn = document.getElementById("addNegativePromptVariantBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  const modalTitle = document.getElementById("channelModalTitle")?.textContent;
  const isEditing = modalTitle?.includes("Edit");
  if (isEditing && state.activeChannelId) {
    const channel = state.channels.find((c) => c.id === state.activeChannelId);
    if (channel) {
      if (!channel.negativePromptVariants) {
        channel.negativePromptVariants = [];
      }
      channel.negativePromptVariants.push(newVariant);
      renderNegativePromptVariantsInModal(channel);
    }
  } else {
    alert("Please save the channel first before adding variants");
  }
}
function editPromptVariant(channel, index, element) {
  const currentText = channel.promptVariants?.[index] || "";
  const textarea = document.createElement("textarea");
  textarea.className = "variant-edit-input";
  textarea.value = currentText;
  textarea.rows = 3;
  const parent = element.parentElement;
  if (!parent) {
    error("Parent element not found for variant editing");
    return;
  }
  element.style.display = "none";
  try {
    parent.insertBefore(textarea, element);
    textarea.focus();
  } catch (e) {
    error("Failed to insert textarea for editing:", e);
    element.style.display = "";
    return;
  }
  const saveEdit = () => {
    const newText = textarea.value.trim();
    if (newText && newText !== currentText) {
      if (!channel.promptVariants) channel.promptVariants = [];
      channel.promptVariants[index] = newText;
      if (state.activeChannelId === channel.id) {
        updatePromptDisplay(channel);
      }
    }
    renderPromptVariantsInModal(channel);
  };
  textarea.addEventListener("blur", saveEdit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
    if (e.key === "Escape") {
      renderPromptVariantsInModal(channel);
    }
  });
}
function editNegativePromptVariant(channel, index, element) {
  const currentText = channel.negativePromptVariants?.[index] || "";
  const textarea = document.createElement("textarea");
  textarea.className = "variant-edit-input";
  textarea.value = currentText;
  textarea.rows = 3;
  const parent = element.parentElement;
  if (!parent) {
    error("Parent element not found for negative variant editing");
    return;
  }
  element.style.display = "none";
  try {
    parent.insertBefore(textarea, element);
    textarea.focus();
  } catch (e) {
    error("Failed to insert textarea for editing:", e);
    element.style.display = "";
    return;
  }
  const saveEdit = () => {
    const newText = textarea.value.trim();
    if (newText && newText !== currentText) {
      if (!channel.negativePromptVariants) channel.negativePromptVariants = [];
      channel.negativePromptVariants[index] = newText;
      if (state.activeChannelId === channel.id) {
        updateNegativePromptDisplay(channel);
      }
    }
    renderNegativePromptVariantsInModal(channel);
  };
  textarea.addEventListener("blur", saveEdit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
    if (e.key === "Escape") {
      renderNegativePromptVariantsInModal(channel);
    }
  });
}
function deletePromptVariant(channel, index) {
  if (!channel.promptVariants) return;
  channel.promptVariants.splice(index, 1);
  if (channel.activeVariantIndex && channel.activeVariantIndex > index + 1) {
    channel.activeVariantIndex--;
  } else if (channel.activeVariantIndex === index + 1) {
    channel.activeVariantIndex = 0;
  }
  renderPromptVariantsInModal(channel);
  if (state.activeChannelId === channel.id) {
    updatePromptDisplay(channel);
  }
}
function deleteNegativePromptVariant(channel, index) {
  if (!channel.negativePromptVariants) return;
  channel.negativePromptVariants.splice(index, 1);
  if (channel.activeNegativeVariantIndex && channel.activeNegativeVariantIndex > index + 1) {
    channel.activeNegativeVariantIndex--;
  } else if (channel.activeNegativeVariantIndex === index + 1) {
    channel.activeNegativeVariantIndex = 0;
  }
  renderNegativePromptVariantsInModal(channel);
  if (state.activeChannelId === channel.id) {
    updateNegativePromptDisplay(channel);
  }
}
function openChannelModal(channelId) {
  const modal = document.getElementById("channelModal");
  const title = document.getElementById("channelModalTitle");
  const nameInput = document.getElementById("channelNameInput");
  const promptInput = document.getElementById("channelPromptInput");
  const negativePromptInput = document.getElementById("channelNegativePromptInput");
  const selectedTagsContainer = document.getElementById("selectedTags");
  selectedTagsContainer.innerHTML = "";
  if (channelId) {
    const channel = state.channels.find((c) => c.id === channelId);
    if (channel) {
      title.textContent = "Edit Channel";
      nameInput.value = channel.name;
      promptInput.value = channel.prompt;
      negativePromptInput.value = channel.negativePrompt || "";
      channel.tags.forEach((tag) => {
        const tagElement = document.createElement("span");
        tagElement.className = "selected-tag";
        tagElement.innerHTML = `${tag}<button class="remove-tag">\xD7</button>`;
        const removeBtn = tagElement.querySelector(".remove-tag");
        removeBtn?.addEventListener("click", () => {
          tagElement.remove();
          renderAvailableTags();
        });
        selectedTagsContainer.appendChild(tagElement);
      });
      renderPromptVariantsInModal(channel);
      renderNegativePromptVariantsInModal(channel);
    }
  } else {
    title.textContent = "Create New Channel";
    nameInput.value = "";
    promptInput.value = "";
    negativePromptInput.value = "";
    document.getElementById("promptVariantsList").innerHTML = "";
    document.getElementById("negativePromptVariantsList").innerHTML = "";
  }
  renderAvailableTags();
  modal.classList.add("active");
  nameInput.focus();
  if (!promptInput.dataset.autocompleteInit) {
    promptInput.addEventListener("input", () => {
      const cursorPos = promptInput.selectionStart;
      const currentWord = getCurrentWord(promptInput.value, cursorPos);
      debouncedAutocomplete(currentWord, promptInput);
    });
    promptInput.addEventListener("keydown", (e) => {
      handleAutocompleteKeydown(e, promptInput);
    });
    promptInput.dataset.autocompleteInit = "true";
  }
}
function closeChannelModal() {
  document.getElementById("channelModal").classList.remove("active");
  const autocomplete = document.getElementById("tagAutocomplete");
  if (autocomplete) {
    autocomplete.style.display = "none";
  }
  autocompleteSelectedIndex = -1;
}
function openTagsModal() {
  renderExistingTags();
  document.getElementById("tagsModal").classList.add("active");
}
function closeTagsModal() {
  document.getElementById("tagsModal").classList.remove("active");
}
let currentImageIndex = 0;
let openedFromGallery = false;
function openImageModal(imageSrc, index) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("modalImage");
  img.src = imageSrc;
  currentImageIndex = index;
  modal.classList.add("active");
  log("\u{1F3A8} Image modal theme:", Theme.current);
  const modalContent = document.querySelector(".image-modal-content");
  modal.style.background = Theme.getModalBg();
  if (modalContent) {
    modalContent.style.background = Theme.getContentBg();
    modalContent.style.borderColor = Theme.getBorderColor();
  }
  log(`\u2705 Image modal: ${Theme.current} theme background`);
  setTimeout(() => {
    if (modalContent) {
      const computedBg = window.getComputedStyle(modalContent).background;
      log("\u{1F4CA} Image modal content computed background:", computedBg);
    }
    const modalBg = window.getComputedStyle(modal).background;
    log("\u{1F4CA} Image modal overlay computed background:", modalBg);
  }, 100);
  const image = new Image();
  image.onload = function() {
    const dimensions = `${image.width} \xD7 ${image.height}`;
    const sizeInBytes = Math.round(imageSrc.length * 3 / 4);
    const sizeInKB = (sizeInBytes / 1024).toFixed(1);
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
    const dimensionsEl = document.getElementById("imageDimensions");
    const sizeEl = document.getElementById("imageSize");
    if (dimensionsEl) dimensionsEl.textContent = dimensions;
    if (sizeEl) {
      if (sizeInBytes > 1024 * 1024) {
        sizeEl.textContent = `${sizeInMB} MB`;
      } else {
        sizeEl.textContent = `${sizeInKB} KB`;
      }
    }
  };
  image.src = imageSrc;
  updateImageNavigation();
}
function updateImageNavigation() {
  if (!state.activeChannelId) return;
  const channel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!channel) return;
  const prevBtn = document.getElementById("prevImageBtn");
  const nextBtn = document.getElementById("nextImageBtn");
  const totalImages = channel.images.length;
  if (totalImages > 1) {
    prevBtn.style.display = "flex";
    nextBtn.style.display = "flex";
  } else {
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
  }
}
function navigateImage(direction) {
  if (!state.activeChannelId) return;
  const channel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!channel) return;
  const totalImages = channel.images.length;
  if (openedFromGallery) {
    if (direction === "prev") {
      currentImageIndex = currentImageIndex < totalImages - 1 ? currentImageIndex + 1 : 0;
    } else if (direction === "next") {
      currentImageIndex = currentImageIndex > 0 ? currentImageIndex - 1 : totalImages - 1;
    }
  } else {
    if (direction === "prev") {
      currentImageIndex = currentImageIndex > 0 ? currentImageIndex - 1 : totalImages - 1;
    } else if (direction === "next") {
      currentImageIndex = currentImageIndex < totalImages - 1 ? currentImageIndex + 1 : 0;
    }
  }
  const img = document.getElementById("modalImage");
  img.src = channel.images[currentImageIndex];
  updateImageNavigation();
}
function closeImageModal() {
  document.getElementById("imageModal").classList.remove("active");
  if (openedFromGallery) {
    openedFromGallery = false;
    openGalleryModal();
  }
}
async function deleteCurrentImage() {
  if (!state.activeChannelId) return;
  const channel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!channel) return;
  const confirmDelete = await customConfirm("Are you sure you want to delete this image?");
  if (confirmDelete) {
    const deletedImage = channel.images[currentImageIndex];
    addUndoAction({
      type: "delete-image",
      data: {
        channelId: state.activeChannelId,
        imageUrl: deletedImage,
        index: currentImageIndex
      },
      timestamp: Date.now()
    });
    const comparisonIndex = selectedImagesForComparison.indexOf(deletedImage);
    if (comparisonIndex !== -1) {
      selectedImagesForComparison.splice(comparisonIndex, 1);
      updateCompareButton();
    }
    channel.images.splice(currentImageIndex, 1);
    closeImageModal();
    saveToStorage();
    renderGallery(channel);
    renderChannelsList();
  }
}
function addTagToChannel() {
  const input = document.getElementById("tagInput");
  const tagName = input.value.trim();
  if (!tagName) return;
  const selectedTags = Array.from(document.querySelectorAll(".selected-tag")).map((tag) => tag.textContent?.replace("\xD7", "").trim() || "");
  if (selectedTags.includes(tagName)) {
    input.value = "";
    return;
  }
  if (!state.tags.includes(tagName)) {
    state.tags.push(tagName);
    throttledSave();
  }
  const selectedTagsContainer = document.getElementById("selectedTags");
  const tagElement = document.createElement("span");
  tagElement.className = "selected-tag";
  tagElement.innerHTML = `${tagName}<button class="remove-tag">\xD7</button>`;
  const removeBtn = tagElement.querySelector(".remove-tag");
  removeBtn?.addEventListener("click", () => {
    tagElement.remove();
  });
  selectedTagsContainer.appendChild(tagElement);
  input.value = "";
  renderAvailableTags();
}
function renderAvailableTags() {
  const container = document.getElementById("availableTags");
  const selectedTags = Array.from(document.querySelectorAll(".selected-tag")).map((tag) => tag.textContent?.replace("\xD7", "").trim() || "");
  const availableTags = state.tags.filter((tag) => !selectedTags.includes(tag));
  container.innerHTML = "";
  availableTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.className = "available-tag";
    btn.textContent = tag;
    btn.addEventListener("click", () => addExistingTag(tag));
    container.appendChild(btn);
  });
}
function addExistingTag(tagName) {
  const selectedTagsContainer = document.getElementById("selectedTags");
  const tagElement = document.createElement("span");
  tagElement.className = "selected-tag";
  tagElement.innerHTML = `${tagName}<button class="remove-tag">\xD7</button>`;
  const removeBtn = tagElement.querySelector(".remove-tag");
  removeBtn?.addEventListener("click", () => {
    tagElement.remove();
    renderAvailableTags();
  });
  selectedTagsContainer.appendChild(tagElement);
  renderAvailableTags();
}
function addNewTag() {
  const input = document.getElementById("newTagInput");
  const tagName = input.value.trim();
  if (!tagName) {
    const addBtn = document.getElementById("addTagBtn");
    if (addBtn) {
      shakeElement(addBtn);
    }
    return;
  }
  if (state.tags.includes(tagName)) {
    alert("This tag already exists");
    return;
  }
  state.tags.push(tagName);
  throttledSave();
  renderExistingTags();
  renderFilterTags();
  input.value = "";
}
function renderExistingTags() {
  const container = document.getElementById("existingTagsList");
  log("\u{1F4CB} Rendering existing tags. Total tags:", state.tags.length);
  log("\u{1F3F7}\uFE0F All tags:", state.tags);
  if (state.tags.length === 0) {
    container.innerHTML = '<p style="color: var(--cream-dark); font-size: 14px; text-align: center; padding: 20px;">No tags created yet</p>';
    return;
  }
  container.innerHTML = "";
  state.tags.forEach((tag) => {
    log("\u{1F528} Creating tag item for:", tag);
    const item = document.createElement("div");
    item.className = "existing-tag-item";
    item.setAttribute("draggable", "true");
    item.setAttribute("data-tag", tag);
    const nameSpan = document.createElement("span");
    nameSpan.className = "existing-tag-name";
    nameSpan.textContent = tag;
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "tag-buttons";
    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit-tag";
    editBtn.title = "Edit tag";
    editBtn.setAttribute("data-tag-name", tag);
    editBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        `;
    const clickHandler = (e) => {
      log("\u{1F3AF} CLICK EVENT FIRED!");
      log("\u{1F3AF} Event target:", e.target);
      log("\u{1F3AF} Event currentTarget:", e.currentTarget);
      e.preventDefault();
      e.stopPropagation();
      const tagName = e.currentTarget.getAttribute("data-tag-name");
      log("\u{1F5B1}\uFE0F Edit button clicked for tag:", tagName);
      log("\u{1F4E6} Tag from closure:", tag);
      log("\u{1F3F7}\uFE0F Tag from attribute:", tagName);
      editTag(tagName);
    };
    editBtn.addEventListener("click", clickHandler);
    log("\u2705 Created edit button for tag:", tag);
    log("\u2705 Attached click listener to button");
    editBtn.style.pointerEvents = "auto";
    editBtn.style.cursor = "pointer";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete-tag";
    deleteBtn.textContent = t("delete");
    deleteBtn.addEventListener("click", async () => {
      const confirmDelete = await customConfirm(t("confirmDeleteTag"));
      if (confirmDelete) {
        deleteTag(tag);
      }
    });
    buttonsContainer.appendChild(editBtn);
    buttonsContainer.appendChild(deleteBtn);
    item.appendChild(nameSpan);
    item.appendChild(buttonsContainer);
    container.appendChild(item);
  });
  setupTagDragAndDrop();
}
function deleteTag(tagName) {
  const affectedChannels = state.channels.filter((c) => c.tags.includes(tagName)).map((c) => ({ id: c.id, tags: [...c.tags] }));
  addUndoAction({
    type: "delete-tag",
    data: {
      tagName,
      affectedChannels
    },
    timestamp: Date.now()
  });
  state.tags = state.tags.filter((t2) => t2 !== tagName);
  state.channels.forEach((channel) => {
    channel.tags = channel.tags.filter((t2) => t2 !== tagName);
  });
  if (state.activeFilter === tagName) {
    state.activeFilter = "all";
  }
  saveToStorage();
  renderExistingTags();
  renderFilterTags();
  renderChannelsList();
  if (state.activeChannelId) {
    selectChannel(state.activeChannelId);
  }
}
async function editTag(oldTagName) {
  log("\u{1F3F7}\uFE0F Edit tag called with:", oldTagName);
  try {
    const message = t("enterNewTagName");
    log("\u{1F4DD} Showing custom prompt modal...");
    const newTagName = await customPrompt(message, oldTagName);
    log("\u{1F4DD} Custom prompt returned:", newTagName);
    if (newTagName === null) {
      log("\u274C User cancelled prompt");
      return;
    }
    if (newTagName.trim() === "") {
      log("\u274C Edit cancelled - empty name");
      alert("Tag name cannot be empty");
      return;
    }
    const trimmedName = newTagName.trim();
    log("\u2702\uFE0F Trimmed name:", trimmedName);
    if (trimmedName === oldTagName) {
      log("\u2139\uFE0F Name unchanged");
      return;
    }
    if (state.tags.includes(trimmedName)) {
      log("\u26A0\uFE0F Duplicate tag name:", trimmedName);
      alert("A tag with this name already exists");
      return;
    }
    const tagIndex = state.tags.indexOf(oldTagName);
    log("\u{1F4CD} Tag index in state.tags:", tagIndex);
    if (tagIndex !== -1) {
      state.tags[tagIndex] = trimmedName;
      log("\u2705 Updated state.tags:", state.tags);
    }
    let channelsUpdated = 0;
    state.channels.forEach((channel) => {
      const channelTagIndex = channel.tags.indexOf(oldTagName);
      if (channelTagIndex !== -1) {
        channel.tags[channelTagIndex] = trimmedName;
        channelsUpdated++;
        log(`\u2705 Updated channel "${channel.name}"`);
      }
    });
    log(`\u{1F4CA} Total channels updated: ${channelsUpdated}`);
    if (state.activeFilter === oldTagName) {
      state.activeFilter = trimmedName;
      log("\u{1F50D} Updated active filter to:", trimmedName);
    }
    log("\u{1F4BE} Saving to storage...");
    saveToStorage();
    log("\u{1F504} Re-rendering UI...");
    renderExistingTags();
    renderFilterTags();
    renderChannelsList();
    if (state.activeChannelId) {
      selectChannel(state.activeChannelId);
    }
    log("\u2705 Edit tag completed successfully");
  } catch (error2) {
    error2("\u274C Error in editTag:", error2);
  }
}
async function compressImage(base64, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = height * maxWidth / width;
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", quality);
          resolve(compressed);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };
      img.src = base64;
    } catch (e) {
      reject(e);
    }
  });
}
function handleFileUpload(e) {
  if (!state.activeChannelId) {
    showErrorNotification("No channel selected. Please select a channel first.");
    return;
  }
  const input = e.target;
  const files = input.files;
  if (!files || files.length === 0) return;
  const channel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!channel) {
    showErrorNotification("Channel not found. Please try again.");
    return;
  }
  const fileCount = files.length;
  const fileWord = fileCount === 1 ? "image" : "images";
  const invalidFiles = Array.from(files).filter((file) => !file.type.startsWith("image/"));
  if (invalidFiles.length > 0) {
    showErrorNotification(`Please select only image files. ${invalidFiles.length} invalid file(s) detected.`);
    input.value = "";
    return;
  }
  showLoadingOverlay(`Uploading ${fileCount} ${fileWord}...`);
  let processedCount = 0;
  let errorCount = 0;
  Array.from(files).forEach(async (file) => {
    const reader = new FileReader();
    reader.onerror = () => {
      errorCount++;
      processedCount++;
      error("Failed to read file:", file.name);
      if (processedCount === fileCount) {
        hideLoadingOverlay();
        if (errorCount > 0) {
          showErrorNotification(`Failed to upload ${errorCount} ${errorCount === 1 ? "image" : "images"}. Please try again.`);
        }
        if (processedCount - errorCount > 0) {
          showSuccessNotification(`Successfully uploaded ${processedCount - errorCount} ${processedCount - errorCount === 1 ? "image" : "images"}.`);
          saveToStorage();
          renderGallery(channel);
          renderChannelsList();
        }
      }
    };
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (!result) {
          throw new Error("Failed to read file data");
        }
        const compressed = await compressImage(result);
        const originalSize = (result.length * 0.75 / 1024).toFixed(0);
        const compressedSize = (compressed.length * 0.75 / 1024).toFixed(0);
        log(`\u{1F4E6} Image compressed: ${originalSize}KB \u2192 ${compressedSize}KB (${((1 - compressed.length / result.length) * 100).toFixed(0)}% reduction)`);
        channel.images.push(compressed);
        processedCount++;
        const overlay = document.getElementById("loadingOverlay");
        const textElement = overlay?.querySelector(".loading-text");
        if (textElement) {
          textElement.textContent = `Processing ${processedCount}/${fileCount} ${fileWord}...`;
        }
        if (processedCount === fileCount) {
          saveToStorage();
          renderGallery(channel);
          renderChannelsList();
          hideLoadingOverlay();
          if (errorCount === 0) {
            showSuccessNotification(`Successfully uploaded ${fileCount} ${fileWord}.`);
          } else {
            showErrorNotification(`Uploaded ${processedCount - errorCount}/${fileCount} images. ${errorCount} failed.`);
          }
        }
      } catch (e2) {
        errorCount++;
        processedCount++;
        error("Failed to process image:", e2);
        if (processedCount === fileCount) {
          hideLoadingOverlay();
          if (errorCount > 0) {
            showErrorNotification(`Failed to process ${errorCount} ${errorCount === 1 ? "image" : "images"}. Please try again.`);
          }
          if (processedCount - errorCount > 0) {
            showSuccessNotification(`Successfully uploaded ${processedCount - errorCount} ${processedCount - errorCount === 1 ? "image" : "images"}.`);
            saveToStorage();
            renderGallery(channel);
            renderChannelsList();
          }
        }
      }
    };
    reader.readAsDataURL(file);
  });
  input.value = "";
}
function openSettingsModal() {
  danbooruTagsPage = 0;
  const channelCountEl = document.getElementById("channelCount");
  const tagCountEl = document.getElementById("tagCount");
  const danbooruTagCountEl = document.getElementById("danbooruTagCount");
  if (channelCountEl) {
    channelCountEl.textContent = state.channels.length.toString();
  }
  if (tagCountEl) {
    tagCountEl.textContent = state.tags.length.toString();
  }
  if (danbooruTagCountEl) {
    danbooruTagCountEl.textContent = customDanbooruTags.length.toString();
  }
  const themeSelector = document.querySelector(".theme-selector");
  const themeOptions = Array.from(themeSelector.querySelectorAll(".theme-option"));
  themeOptions.sort((a, b) => {
    const aActive = a.classList.contains("active") ? 0 : 1;
    const bActive = b.classList.contains("active") ? 0 : 1;
    return aActive - bActive;
  });
  themeSelector.innerHTML = "";
  themeOptions.forEach((option) => themeSelector.appendChild(option));
  document.getElementById("settingsModal").classList.add("active");
  setTimeout(() => {
    renderDanbooruTags();
  }, 50);
}
function closeSettingsModal() {
  document.getElementById("settingsModal").classList.remove("active");
}
function openGalleryModal() {
  log("\u{1F680} Opening gallery modal...");
  const totalImages = state.channels.reduce((count, channel) => count + channel.images.length, 0);
  if (totalImages === 0) {
    log("\u26A0\uFE0F Cannot open gallery - no images available");
    showErrorNotification("No images in gallery yet. Upload some images first!");
    return;
  }
  const imageModal = document.getElementById("imageModal");
  if (imageModal?.classList.contains("active")) {
    log("\u26A0\uFE0F Closing image modal first");
    closeImageModal();
  }
  const modal = document.getElementById("galleryModal");
  if (modal) {
    modal.classList.add("active");
    const modalContent = modal.querySelector(".modal-content");
    if (modalContent) {
      if (Theme.isOLED()) {
        modalContent.style.background = "linear-gradient(135deg, #000000 0%, #0a0a0a 50%, #000000 100%)";
        log("\u2705 OLED gradient background applied");
      } else {
        modalContent.style.background = "";
        log("\u2705 Using CSS theme background");
      }
    }
    log("\u2705 Gallery modal opened");
    setTimeout(() => {
      renderGalleryGrid();
    }, 50);
  } else {
    error("\u274C Gallery modal element not found");
  }
}
function closeGalleryModal() {
  document.getElementById("galleryModal").classList.remove("active");
}
function collectImagesFromChannels() {
  const allImages = [];
  state.channels.forEach((channel) => {
    log(`\u{1F4C1} Channel "${channel.name}": ${channel.images.length} images`);
    channel.images.forEach((imageSrc, index) => {
      allImages.push({
        src: imageSrc,
        channelId: channel.id,
        channelName: channel.name,
        // Use reverse index as timestamp approximation (newer images have higher indices)
        timestamp: index
      });
    });
  });
  log("\u{1F3A8} Total images collected:", allImages.length);
  log("\u{1F50D} First few images:", allImages.slice(0, 3));
  allImages.reverse();
  return allImages;
}
function renderGalleryEmptyState(container) {
  log("\u2139\uFE0F No images to display, showing empty state");
  container.innerHTML = `
        <div class="gallery-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p>No images in gallery yet</p>
        </div>
    `;
}
function escapeHtmlAttribute(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function createGalleryGridItemHTML(image, itemBg) {
  const safeSrc = escapeHtmlAttribute(image.src);
  const safeChannelId = escapeHtmlAttribute(image.channelId);
  const safeChannelName = escapeHtmlAttribute(image.channelName);
  const safeItemBg = escapeHtmlAttribute(itemBg);
  return `
        <div class="gallery-grid-item" style="width: 110px; height: 110px; position: relative; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid rgba(192, 192, 192, 0.5); transition: all 0.3s ease; background: ${safeItemBg}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(192, 192, 192, 0.1);" data-channel-id="${safeChannelId}" data-image-src="${safeSrc}">
            <img src="${safeSrc}" alt="${safeChannelName}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
        </div>
    `;
}
function renderGalleryGrid() {
  log("\u{1F5BC}\uFE0F renderGalleryGrid() called");
  const galleryGrid = document.getElementById("allGalleryGrid");
  log("\u{1F4E6} Gallery grid element:", galleryGrid);
  if (!galleryGrid) {
    error("\u274C All gallery grid element not found");
    return;
  }
  galleryGrid.style.display = "grid";
  galleryGrid.style.gridTemplateColumns = "repeat(auto-fill, 110px)";
  galleryGrid.style.gridAutoFlow = "row dense";
  galleryGrid.style.gridAutoRows = "min-content";
  galleryGrid.style.gap = "10px";
  galleryGrid.style.padding = "24px";
  galleryGrid.style.maxHeight = "calc(90vh - 100px)";
  galleryGrid.style.overflowY = "auto";
  galleryGrid.style.justifyContent = "center";
  galleryGrid.style.alignContent = "start";
  galleryGrid.style.background = "transparent";
  galleryGrid.style.border = "none";
  galleryGrid.style.boxShadow = "none";
  galleryGrid.style.minHeight = "auto";
  galleryGrid.style.width = "100%";
  log("\u2705 Gallery grid inline styles applied (110px thumbnails for 7 per row)");
  log("\u{1F4CA} Total channels:", state.channels.length);
  const allImages = collectImagesFromChannels();
  if (allImages.length === 0) {
    renderGalleryEmptyState(galleryGrid);
    return;
  }
  log("\u2705 Rendering", allImages.length, "images in gallery grid");
  try {
    const itemBg = Theme.isOLED() ? "#0a0a0a" : "#F5F5F5";
    const htmlContent = allImages.map((image) => createGalleryGridItemHTML(image, itemBg)).join("");
    log("\u{1F4DD} Generated HTML length:", htmlContent.length);
    log("\u{1F3A8} Using 110px thumbnails for 7 per row");
    galleryGrid.innerHTML = htmlContent;
    log("\u2705 Gallery grid HTML rendered");
    log("\u{1F522} Gallery grid children count:", galleryGrid.children.length);
    const computedStyle = window.getComputedStyle(galleryGrid);
    log("\u{1F3A8} Gallery grid computed styles:");
    log("  - grid-template-columns:", computedStyle.gridTemplateColumns);
    log("  - gap:", computedStyle.gap);
    log("  - width:", computedStyle.width);
    log("  - height:", computedStyle.height);
    const firstItem = galleryGrid.querySelector(".gallery-grid-item");
    if (firstItem) {
      const itemStyle = window.getComputedStyle(firstItem);
      const itemRect = firstItem.getBoundingClientRect();
      log("\u{1F4D0} First gallery item:");
      log("  - computed width:", itemStyle.width);
      log("  - computed height:", itemStyle.height);
      log("  - actual rendered width:", itemRect.width + "px");
      log("  - actual rendered height:", itemRect.height + "px");
      log("  - border:", itemStyle.border);
      log("  - border-color:", itemStyle.borderColor);
      log("  - box-shadow:", itemStyle.boxShadow);
      log("  - background:", itemStyle.background);
      log("  - border-radius:", itemStyle.borderRadius);
    }
    log("\u2705 Gallery grid rendered - using global event delegation for clicks");
  } catch (e) {
    error("\u274C Failed to render gallery grid:", e);
    showErrorNotification("Failed to render gallery. Please refresh the page.");
    renderGalleryEmptyState(galleryGrid);
  }
}
function openDanbooruTagManagerModal() {
  danbooruTagsPage = 0;
  danbooruSearchQuery = "";
  const searchInput = document.getElementById("danbooruSearchInput");
  const clearBtn = document.getElementById("clearDanbooruSearchBtn");
  if (searchInput) {
    searchInput.value = "";
  }
  if (clearBtn) {
    clearBtn.style.display = "none";
  }
  renderDanbooruTags();
  document.getElementById("danbooruTagManagerModal").classList.add("active");
}
function closeDanbooruTagManagerModal() {
  document.getElementById("danbooruTagManagerModal").classList.remove("active");
}
function exportData() {
  try {
    const hasData = state.channels.length > 0 || state.tags.length > 0 || customDanbooruTags.length > 0;
    if (!hasData) {
      const btn = document.getElementById("exportDataBtn");
      if (btn) {
        shakeElement(btn);
      }
      showErrorNotification("No data to export. Create some channels or tags first.");
      return;
    }
    const data = {
      channels: state.channels,
      tags: state.tags,
      customDanbooruTags,
      version: "1.0.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const jsonString = JSON.stringify(data, null, 2);
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.top = "0";
    backdrop.style.left = "0";
    backdrop.style.width = "100%";
    backdrop.style.height = "100%";
    backdrop.style.background = "rgba(0, 0, 0, 0.6)";
    backdrop.style.backdropFilter = "blur(4px)";
    backdrop.style.zIndex = "2999";
    document.body.appendChild(backdrop);
    const textArea = document.createElement("textarea");
    textArea.value = jsonString;
    textArea.style.position = "fixed";
    textArea.style.top = "50%";
    textArea.style.left = "50%";
    textArea.style.transform = "translate(-50%, -50%)";
    textArea.style.width = "80%";
    textArea.style.height = "60%";
    textArea.style.padding = "20px";
    textArea.style.background = "#1a0a0a";
    textArea.style.color = "#f4e8d8";
    textArea.style.border = "2px solid var(--silver)";
    textArea.style.borderRadius = "12px";
    textArea.style.fontSize = "14px";
    textArea.style.fontFamily = "monospace";
    textArea.style.zIndex = "3000";
    textArea.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.5), 0 16px 64px rgba(0, 0, 0, 0.4)";
    textArea.readOnly = true;
    document.body.appendChild(textArea);
    textArea.select();
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.position = "fixed";
    closeBtn.style.top = "calc(50% + 32%)";
    closeBtn.style.left = "50%";
    closeBtn.style.transform = "translateX(-50%)";
    closeBtn.style.padding = "10px 24px";
    closeBtn.style.background = "var(--reddish-brown)";
    closeBtn.style.color = "var(--cream)";
    closeBtn.style.border = "1px solid var(--silver)";
    closeBtn.style.borderRadius = "6px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.zIndex = "3001";
    closeBtn.onclick = () => {
      if (document.body.contains(textArea)) {
        document.body.removeChild(textArea);
      }
      if (document.body.contains(closeBtn)) {
        document.body.removeChild(closeBtn);
      }
      if (document.body.contains(backdrop)) {
        document.body.removeChild(backdrop);
      }
    };
    document.body.appendChild(closeBtn);
    copyToClipboard(jsonString).then((success) => {
      if (success) {
        const message = document.createElement("div");
        message.textContent = "\u2713 Data copied to clipboard! Save it as a .json file.";
        message.style.position = "fixed";
        message.style.top = "20px";
        message.style.left = "50%";
        message.style.transform = "translateX(-50%)";
        message.style.background = "#34c759";
        message.style.color = "white";
        message.style.padding = "12px 24px";
        message.style.borderRadius = "8px";
        message.style.fontWeight = "600";
        message.style.zIndex = "3001";
        message.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
        document.body.appendChild(message);
        setTimeout(() => {
          if (document.body.contains(message)) {
            document.body.removeChild(message);
          }
        }, 3e3);
      } else {
        error("Copy failed - textarea remains open for manual copy");
        showErrorNotification("Failed to copy to clipboard. Please copy manually from the text area.");
      }
    });
  } catch (e) {
    error("Failed to export data:", e);
    showErrorNotification("Failed to export data. Please try again.");
  }
}
function exportChannel(channelId) {
  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) {
    error("Channel not found for export");
    return;
  }
  log("Exporting channel:", channel.name);
  const data = {
    channel,
    version: "1.0.0",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const jsonString = JSON.stringify(data, null, 2);
  const filename = `${channel.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_channel.json`;
  const textArea = document.createElement("textarea");
  textArea.value = jsonString;
  textArea.style.position = "fixed";
  textArea.style.top = "50%";
  textArea.style.left = "50%";
  textArea.style.transform = "translate(-50%, -50%)";
  textArea.style.width = "80%";
  textArea.style.height = "60%";
  textArea.style.padding = "20px";
  textArea.style.background = "#1a0a0a";
  textArea.style.color = "#f4e8d8";
  textArea.style.border = "2px solid var(--silver)";
  textArea.style.borderRadius = "12px";
  textArea.style.fontSize = "14px";
  textArea.style.fontFamily = "monospace";
  textArea.style.zIndex = "3000";
  textArea.readOnly = true;
  document.body.appendChild(textArea);
  textArea.select();
  copyToClipboard(jsonString).then((success) => {
    if (success) {
      const message = document.createElement("div");
      message.textContent = `\u2713 Channel "${channel.name}" data copied to clipboard! Save it as ${filename}`;
      message.style.position = "fixed";
      message.style.top = "20px";
      message.style.left = "50%";
      message.style.transform = "translateX(-50%)";
      message.style.background = "#34c759";
      message.style.color = "white";
      message.style.padding = "12px 24px";
      message.style.borderRadius = "8px";
      message.style.fontWeight = "600";
      message.style.zIndex = "3001";
      message.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      document.body.appendChild(message);
      setTimeout(() => {
        document.body.removeChild(message);
        document.body.removeChild(textArea);
      }, 3e3);
    } else {
      error("Copy failed");
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Close";
      closeBtn.style.position = "fixed";
      closeBtn.style.top = "calc(50% + 32%)";
      closeBtn.style.left = "50%";
      closeBtn.style.transform = "translateX(-50%)";
      closeBtn.style.padding = "10px 24px";
      closeBtn.style.background = "var(--reddish-brown)";
      closeBtn.style.color = "var(--cream)";
      closeBtn.style.border = "1px solid var(--silver)";
      closeBtn.style.borderRadius = "6px";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.zIndex = "3001";
      closeBtn.onclick = () => {
        document.body.removeChild(textArea);
        document.body.removeChild(closeBtn);
      };
      document.body.appendChild(closeBtn);
    }
  });
}
function importData(e) {
  const input = e.target;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.name.endsWith(".json")) {
    showErrorNotification("Please select a valid JSON file.");
    input.value = "";
    return;
  }
  showLoadingOverlay("Importing data...");
  const reader = new FileReader();
  reader.onerror = () => {
    hideLoadingOverlay();
    error("Failed to read import file");
    showErrorNotification("Failed to read file. Please try again.");
    input.value = "";
  };
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result);
      if (!data.channels || !Array.isArray(data.channels)) {
        hideLoadingOverlay();
        showErrorNotification("Invalid backup file: missing or invalid channels data.");
        input.value = "";
        return;
      }
      if (!data.tags || !Array.isArray(data.tags)) {
        hideLoadingOverlay();
        showErrorNotification("Invalid backup file: missing or invalid tags data.");
        input.value = "";
        return;
      }
      state.channels = data.channels;
      state.tags = data.tags;
      state.activeChannelId = null;
      state.activeFilter = "all";
      state.activeFilters = [];
      if (data.customDanbooruTags && Array.isArray(data.customDanbooruTags)) {
        customDanbooruTags = data.customDanbooruTags;
      }
      saveToStorage();
      renderChannelsList();
      renderFilterTags();
      showEmptyState();
      closeSettingsModal();
      hideLoadingOverlay();
      showSuccessNotification(`Successfully imported ${data.channels.length} channels and ${data.tags.length} tags.`);
    } catch (err) {
      hideLoadingOverlay();
      error("Failed to import data:", err);
      showErrorNotification("Failed to import data. Please check the file format.");
    }
  };
  reader.readAsText(file);
  input.value = "";
}
async function clearAllData() {
  const hasData = state.channels.length > 0 || state.tags.length > 0 || customDanbooruTags.length > 0;
  if (!hasData) {
    const btn = document.getElementById("clearDataBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  const confirmClear = await customConfirm(t("confirmClearData"));
  if (confirmClear) {
    state.channels = [];
    state.tags = [];
    state.activeChannelId = null;
    state.activeFilter = "all";
    customDanbooruTags = [];
    saveToStorage();
    renderChannelsList();
    renderFilterTags();
    showEmptyState();
    closeSettingsModal();
    alert("All data has been cleared.");
  }
}
async function handleEmojiFontUpload(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.name.endsWith(".ttf") && !file.name.endsWith(".otf")) {
    alert("Please upload a .ttf or .otf font file");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    const proceed = await customConfirm("This font file is large (" + Math.round(file.size / 1024 / 1024) + "MB). Continue?", "Continue", "Cancel");
    if (!proceed) return;
  }
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Font = e.target?.result;
      await storageSet("customEmojiFont", base64Font);
      await storageSet("customEmojiFontName", file.name);
      applyCustomEmojiFont(base64Font);
      const statusEl = document.getElementById("emojiFontStatus");
      if (statusEl) statusEl.textContent = `\u2713 Using: ${file.name}`;
      const resetBtn = document.getElementById("resetEmojiFontBtn");
      if (resetBtn) resetBtn.style.display = "inline-block";
    };
    reader.readAsDataURL(file);
  } catch (error2) {
    error2("Failed to upload emoji font:", error2);
    alert("Failed to upload font file");
  }
}
function applyCustomEmojiFont(base64Font) {
  log("\u{1F3A8} Applying custom emoji font...");
  const existingStyle = document.getElementById("custom-emoji-font");
  if (existingStyle) {
    log("\u{1F5D1}\uFE0F Removing existing custom emoji font style");
    existingStyle.remove();
  }
  const style = document.createElement("style");
  style.id = "custom-emoji-font";
  style.textContent = `
        @font-face {
            font-family: 'CustomEmojiFont';
            src: url('${base64Font}') format('truetype');
            unicode-range: U+200D, U+2030-205F, U+2190-21FF, U+2300-23FF, U+2460-24FF, U+25A0-25FF, U+2600-27BF, U+2900-297F, U+2B00-2BFF, U+3000-303F, U+3297, U+3299, U+FE00-FE0F, U+1F000-1F02F, U+1F0A0-1F0FF, U+1F100-1F64F, U+1F680-1F6FF, U+1F700-1F77F, U+1F780-1F7FF, U+1F800-1F8FF, U+1F900-1F9FF, U+1FA00-1FA6F, U+1FA70-1FAFF, U+E0020-E007F;
        }
        body, body *:not(.app-title):not(.top-bar-title) {
            font-family: 'Spectral', serif, 'CustomEmojiFont', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif !important;
        }
    `;
  document.head.appendChild(style);
  log("\u2705 Custom emoji font style injected into DOM");
  const titleElement = document.querySelector(".top-bar-title");
  if (titleElement) {
    const computedStyle = window.getComputedStyle(titleElement);
    log("\u{1F50D} Title element found");
    log("\u{1F4DD} Title computed font-family:", computedStyle.fontFamily);
    log("\u{1F4DD} Title font-size:", computedStyle.fontSize);
    log("\u{1F4DD} Title font-weight:", computedStyle.fontWeight);
  } else {
    log("\u274C Title element (.top-bar-title) not found!");
  }
}
async function resetEmojiFont() {
  localStorage.removeItem("serpentsBook_customEmojiFont");
  localStorage.removeItem("serpentsBook_customEmojiFontName");
  const existingStyle = document.getElementById("custom-emoji-font");
  if (existingStyle) existingStyle.remove();
  const statusEl = document.getElementById("emojiFontStatus");
  if (statusEl) statusEl.textContent = "";
  const resetBtn = document.getElementById("resetEmojiFontBtn");
  if (resetBtn) resetBtn.style.display = "none";
  alert("Reset to default emoji font");
}
async function loadCustomEmojiFont() {
  const fontData = await storageGet("customEmojiFont");
  const fontName = await storageGet("customEmojiFontName");
  if (fontData) {
    applyCustomEmojiFont(fontData);
    const statusEl = document.getElementById("emojiFontStatus");
    if (statusEl && fontName) statusEl.textContent = `\u2713 Using: ${fontName}`;
    const resetBtn = document.getElementById("resetEmojiFontBtn");
    if (resetBtn) resetBtn.style.display = "inline-block";
  }
}
const emojiVariants = {
  "\u{1F44D}": ["\u{1F44D}", "\u{1F44D}\u{1F3FB}", "\u{1F44D}\u{1F3FC}", "\u{1F44D}\u{1F3FD}", "\u{1F44D}\u{1F3FE}", "\u{1F44D}\u{1F3FF}"],
  "\u{1F44E}": ["\u{1F44E}", "\u{1F44E}\u{1F3FB}", "\u{1F44E}\u{1F3FC}", "\u{1F44E}\u{1F3FD}", "\u{1F44E}\u{1F3FE}", "\u{1F44E}\u{1F3FF}"],
  "\u270C": ["\u270C", "\u270C\u{1F3FB}", "\u270C\u{1F3FC}", "\u270C\u{1F3FD}", "\u270C\u{1F3FE}", "\u270C\u{1F3FF}"],
  "\u270A": ["\u270A", "\u270A\u{1F3FB}", "\u270A\u{1F3FC}", "\u270A\u{1F3FD}", "\u270A\u{1F3FE}", "\u270A\u{1F3FF}"],
  "\u270B": ["\u270B", "\u270B\u{1F3FB}", "\u270B\u{1F3FC}", "\u270B\u{1F3FD}", "\u270B\u{1F3FE}", "\u270B\u{1F3FF}"],
  "\u{1F44B}": ["\u{1F44B}", "\u{1F44B}\u{1F3FB}", "\u{1F44B}\u{1F3FC}", "\u{1F44B}\u{1F3FD}", "\u{1F44B}\u{1F3FE}", "\u{1F44B}\u{1F3FF}"],
  "\u{1F91A}": ["\u{1F91A}", "\u{1F91A}\u{1F3FB}", "\u{1F91A}\u{1F3FC}", "\u{1F91A}\u{1F3FD}", "\u{1F91A}\u{1F3FE}", "\u{1F91A}\u{1F3FF}"],
  "\u{1F590}": ["\u{1F590}", "\u{1F590}\u{1F3FB}", "\u{1F590}\u{1F3FC}", "\u{1F590}\u{1F3FD}", "\u{1F590}\u{1F3FE}", "\u{1F590}\u{1F3FF}"],
  "\u270D": ["\u270D", "\u270D\u{1F3FB}", "\u270D\u{1F3FC}", "\u270D\u{1F3FD}", "\u270D\u{1F3FE}", "\u270D\u{1F3FF}"],
  "\u{1F64F}": ["\u{1F64F}", "\u{1F64F}\u{1F3FB}", "\u{1F64F}\u{1F3FC}", "\u{1F64F}\u{1F3FD}", "\u{1F64F}\u{1F3FE}", "\u{1F64F}\u{1F3FF}"],
  "\u{1F4AA}": ["\u{1F4AA}", "\u{1F4AA}\u{1F3FB}", "\u{1F4AA}\u{1F3FC}", "\u{1F4AA}\u{1F3FD}", "\u{1F4AA}\u{1F3FE}", "\u{1F4AA}\u{1F3FF}"],
  "\u{1F442}": ["\u{1F442}", "\u{1F442}\u{1F3FB}", "\u{1F442}\u{1F3FC}", "\u{1F442}\u{1F3FD}", "\u{1F442}\u{1F3FE}", "\u{1F442}\u{1F3FF}"],
  "\u{1F443}": ["\u{1F443}", "\u{1F443}\u{1F3FB}", "\u{1F443}\u{1F3FC}", "\u{1F443}\u{1F3FD}", "\u{1F443}\u{1F3FE}", "\u{1F443}\u{1F3FF}"],
  "\u{1F933}": ["\u{1F933}", "\u{1F933}\u{1F3FB}", "\u{1F933}\u{1F3FC}", "\u{1F933}\u{1F3FD}", "\u{1F933}\u{1F3FE}", "\u{1F933}\u{1F3FF}"],
  "\u{1F485}": ["\u{1F485}", "\u{1F485}\u{1F3FB}", "\u{1F485}\u{1F3FC}", "\u{1F485}\u{1F3FD}", "\u{1F485}\u{1F3FE}", "\u{1F485}\u{1F3FF}"],
  "\u{1F919}": ["\u{1F919}", "\u{1F919}\u{1F3FB}", "\u{1F919}\u{1F3FC}", "\u{1F919}\u{1F3FD}", "\u{1F919}\u{1F3FE}", "\u{1F919}\u{1F3FF}"],
  "\u{1F476}": ["\u{1F476}", "\u{1F476}\u{1F3FB}", "\u{1F476}\u{1F3FC}", "\u{1F476}\u{1F3FD}", "\u{1F476}\u{1F3FE}", "\u{1F476}\u{1F3FF}"],
  "\u{1F466}": ["\u{1F466}", "\u{1F466}\u{1F3FB}", "\u{1F466}\u{1F3FC}", "\u{1F466}\u{1F3FD}", "\u{1F466}\u{1F3FE}", "\u{1F466}\u{1F3FF}"],
  "\u{1F467}": ["\u{1F467}", "\u{1F467}\u{1F3FB}", "\u{1F467}\u{1F3FC}", "\u{1F467}\u{1F3FD}", "\u{1F467}\u{1F3FE}", "\u{1F467}\u{1F3FF}"],
  "\u{1F468}": ["\u{1F468}", "\u{1F468}\u{1F3FB}", "\u{1F468}\u{1F3FC}", "\u{1F468}\u{1F3FD}", "\u{1F468}\u{1F3FE}", "\u{1F468}\u{1F3FF}"],
  "\u{1F469}": ["\u{1F469}", "\u{1F469}\u{1F3FB}", "\u{1F469}\u{1F3FC}", "\u{1F469}\u{1F3FD}", "\u{1F469}\u{1F3FE}", "\u{1F469}\u{1F3FF}"],
  "\u{1F642}": ["\u{1F642}", "\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F606}", "\u{1F605}", "\u{1F923}", "\u{1F602}"],
  "\u{1F60A}": ["\u{1F60A}", "\u{1F607}", "\u{1F643}", "\u{1F609}", "\u{1F60C}", "\u{1F60D}", "\u{1F970}", "\u{1F618}", "\u{1F617}"],
  "\u{1F60E}": ["\u{1F60E}", "\u{1F913}", "\u{1F9D0}", "\u{1F60F}", "\u{1F612}", "\u{1F61E}", "\u{1F614}", "\u{1F61F}", "\u{1F615}"],
  "\u{1F610}": ["\u{1F610}", "\u{1F611}", "\u{1F636}", "\u{1F644}", "\u{1F62C}", "\u{1F910}", "\u{1F62F}", "\u{1F626}", "\u{1F627}"],
  "\u2764": ["\u2764", "\u{1F9E1}", "\u{1F49B}", "\u{1F49A}", "\u{1F499}", "\u{1F49C}", "\u{1F5A4}", "\u{1F90D}", "\u{1F90E}"]
};
let emojiVariantMenuActive = false;
let currentEmojiTarget = null;
function showEmojiVariantMenu(emoji, x, y, targetElement) {
  const menu = document.getElementById("emojiVariantMenu");
  const grid = document.getElementById("emojiVariantGrid");
  if (!menu || !grid) return;
  const variants = emojiVariants[emoji];
  if (!variants || variants.length <= 1) {
    shakeElement(targetElement);
    hideEmojiVariantMenu();
    return;
  }
  grid.innerHTML = "";
  variants.forEach((variant) => {
    const item = document.createElement("div");
    item.className = "emoji-variant-item";
    item.textContent = variant;
    item.addEventListener("click", () => {
      replaceEmojiWithVariant(targetElement, emoji, variant);
      hideEmojiVariantMenu();
    });
    grid.appendChild(item);
  });
  log("\u{1F4CD} Emoji coordinates:", x, y);
  log("\u{1F4CD} Window size:", window.innerWidth, "x", window.innerHeight);
  const menuWidth = 320;
  const menuHeight = 200;
  const gap = 8;
  let left = x - menuWidth / 2;
  let top = y + 32;
  log("\u{1F4CD} Initial emoji-aligned position: left =", left, ", top =", top);
  if (left < gap) {
    left = gap;
    log("\u{1F4CD} Adjusted for left edge: left =", left);
  } else if (left + menuWidth > window.innerWidth - gap) {
    left = window.innerWidth - menuWidth - gap;
    log("\u{1F4CD} Adjusted for right edge: left =", left);
  }
  if (top + menuHeight > window.innerHeight - gap) {
    top = y - menuHeight - gap;
    log("\u{1F4CD} Adjusted for bottom edge (showing above): top =", top);
    if (top < gap) {
      top = gap;
      log("\u{1F4CD} Adjusted for top edge: top =", top);
    }
  }
  log("\u{1F4CD} Final position: left =", left, ", top =", top);
  const backdrop = document.getElementById("emojiVariantBackdrop");
  if (backdrop) backdrop.style.display = "block";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.display = "block";
  emojiVariantMenuActive = true;
  currentEmojiTarget = targetElement;
}
function showEmojiVariantMenuWithCallback(emoji, targetElement, callback) {
  const menu = document.getElementById("emojiVariantMenu");
  const grid = document.getElementById("emojiVariantGrid");
  if (!menu || !grid) return;
  const variants = emojiVariants[emoji];
  if (!variants || variants.length <= 1) {
    hideEmojiVariantMenu();
    return;
  }
  grid.innerHTML = "";
  variants.forEach((variant) => {
    const item = document.createElement("div");
    item.className = "emoji-variant-item";
    item.textContent = variant;
    item.addEventListener("click", () => {
      callback(variant);
    });
    grid.appendChild(item);
  });
  const rect = targetElement.getBoundingClientRect();
  log("\u{1F4CD} [Picker] Target element rect:", rect);
  log("\u{1F4CD} [Picker] Window size:", window.innerWidth, "x", window.innerHeight);
  const menuWidth = 320;
  const menuHeight = 200;
  const gap = 8;
  let left = rect.left + rect.width / 2 - menuWidth / 2;
  let top = rect.bottom + gap;
  log("\u{1F4CD} [Picker] Initial centered position: left =", left, ", top =", top);
  if (left < gap) {
    left = gap;
    log("\u{1F4CD} [Picker] Adjusted for left edge: left =", left);
  } else if (left + menuWidth > window.innerWidth - gap) {
    left = window.innerWidth - menuWidth - gap;
    log("\u{1F4CD} [Picker] Adjusted for right edge: left =", left);
  }
  if (top + menuHeight > window.innerHeight - gap) {
    top = rect.top - menuHeight - gap;
    log("\u{1F4CD} [Picker] Adjusted for bottom edge (showing above): top =", top);
    if (top < gap) {
      top = gap;
      log("\u{1F4CD} [Picker] Adjusted for top edge: top =", top);
    }
  }
  log("\u{1F4CD} [Picker] Final position: left =", left, ", top =", top);
  const backdrop = document.getElementById("emojiVariantBackdrop");
  if (backdrop) backdrop.style.display = "block";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.display = "block";
  emojiVariantMenuActive = true;
}
function hideEmojiVariantMenu() {
  const menu = document.getElementById("emojiVariantMenu");
  const backdrop = document.getElementById("emojiVariantBackdrop");
  if (menu) {
    menu.style.display = "none";
  }
  if (backdrop) {
    backdrop.style.display = "none";
  }
  emojiVariantMenuActive = false;
  currentEmojiTarget = null;
}
async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      warn("Clipboard API failed, falling back to textarea method:", err);
    }
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "-9999px";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    document.body.removeChild(textArea);
    error("All copy methods failed:", err);
    return false;
  }
}
function shakeElement(element) {
  element.classList.add("shake-animation");
  setTimeout(() => {
    element.classList.remove("shake-animation");
  }, 500);
}
function showEmojiVariantMenuUnderElement(emoji, element, callback) {
  const menu = document.getElementById("emojiVariantMenu");
  const grid = document.getElementById("emojiVariantGrid");
  if (!menu || !grid) return;
  const variants = emojiVariants[emoji];
  if (!variants || variants.length <= 1) {
    hideEmojiVariantMenu();
    return;
  }
  grid.innerHTML = "";
  variants.forEach((variant) => {
    const item = document.createElement("div");
    item.className = "emoji-variant-item";
    item.textContent = variant;
    item.addEventListener("click", () => {
      callback(variant);
    });
    grid.appendChild(item);
  });
  menu.style.left = "-9999px";
  menu.style.top = "-9999px";
  menu.style.display = "block";
  const menuRect = menu.getBoundingClientRect();
  const menuWidth = menuRect.width;
  const menuHeight = menuRect.height;
  menu.style.display = "none";
  const rect = element.getBoundingClientRect();
  log("\u{1F4CD} [Aligned] Emoji button rect:", rect);
  log("\u{1F4CD} [Aligned] Window size:", window.innerWidth, "x", window.innerHeight);
  log("\u{1F4CD} [Aligned] Actual menu size:", menuWidth, "x", menuHeight);
  const gap = 4;
  let left;
  let top = rect.bottom + gap;
  const spaceOnRight = window.innerWidth - rect.left;
  const spaceOnLeft = rect.right;
  log("\u{1F4CD} [Aligned] Space on right:", spaceOnRight);
  log("\u{1F4CD} [Aligned] Space on left:", spaceOnLeft);
  const emojiCenter = rect.left + rect.width / 2;
  const windowCenter = window.innerWidth / 2;
  const distanceFromCenter = Math.abs(emojiCenter - windowCenter);
  const isNearEdge = distanceFromCenter > window.innerWidth * 0.3;
  log("\u{1F4CD} [Aligned] Emoji center:", emojiCenter, "Window center:", windowCenter);
  log("\u{1F4CD} [Aligned] Distance from center:", distanceFromCenter, "Near edge?", isNearEdge);
  if (spaceOnRight >= menuWidth + gap && spaceOnLeft >= menuWidth + gap && !isNearEdge) {
    left = emojiCenter - menuWidth / 2;
    log("\u{1F4CD} [Aligned] Center area: centering menu under emoji");
  } else if (spaceOnRight >= menuWidth + gap) {
    left = rect.left;
    log("\u{1F4CD} [Aligned] Aligning left edge of menu with left edge of button");
  } else if (spaceOnLeft >= menuWidth + gap) {
    left = rect.right - menuWidth;
    log("\u{1F4CD} [Aligned] Aligning right edge of menu with right edge of button");
  } else {
    left = rect.left + rect.width / 2 - menuWidth / 2;
    log("\u{1F4CD} [Aligned] Not enough space, centering menu on button");
  }
  log("\u{1F4CD} [Aligned] Initial smart position: left =", left, ", top =", top);
  if (left < gap) {
    left = gap;
    log("\u{1F4CD} [Aligned] Adjusted for left edge: left =", left);
  } else if (left + menuWidth > window.innerWidth - gap) {
    left = window.innerWidth - menuWidth - gap;
    log("\u{1F4CD} [Aligned] Adjusted for right edge: left =", left);
  }
  if (top + menuHeight > window.innerHeight - gap) {
    const topAbove = rect.top - menuHeight - gap;
    if (topAbove >= gap) {
      top = topAbove;
      log("\u{1F4CD} [Aligned] Not enough space below, showing above: top =", top);
    } else {
      top = window.innerHeight - menuHeight - gap;
      log("\u{1F4CD} [Aligned] Not enough space above or below, pinning to bottom: top =", top);
      if (top < gap) {
        top = gap;
        log("\u{1F4CD} [Aligned] Menu too tall, pinning to top: top =", top);
      }
    }
  }
  log("\u{1F4CD} [Aligned] Final position: left =", left, ", top =", top);
  const backdrop = document.getElementById("emojiVariantBackdrop");
  if (backdrop) backdrop.style.display = "block";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.display = "block";
  emojiVariantMenuActive = true;
}
function showEmojiVariantMenuAtPosition(emoji, x, y, callback) {
  const menu = document.getElementById("emojiVariantMenu");
  const grid = document.getElementById("emojiVariantGrid");
  if (!menu || !grid) return;
  const variants = emojiVariants[emoji];
  if (!variants || variants.length <= 1) {
    hideEmojiVariantMenu();
    return;
  }
  grid.innerHTML = "";
  variants.forEach((variant) => {
    const item = document.createElement("div");
    item.className = "emoji-variant-item";
    item.textContent = variant;
    item.addEventListener("click", () => {
      callback(variant);
    });
    grid.appendChild(item);
  });
  log("\u{1F4CD} [Mouse] Mouse position:", x, y);
  log("\u{1F4CD} [Mouse] Window size:", window.innerWidth, "x", window.innerHeight);
  const menuWidth = 320;
  const menuHeight = 200;
  const gap = 8;
  let left = x - menuWidth / 2;
  let top = y + gap;
  log("\u{1F4CD} [Mouse] Initial position below cursor: left =", left, ", top =", top);
  if (left < gap) {
    left = gap;
    log("\u{1F4CD} [Mouse] Adjusted for left edge: left =", left);
  } else if (left + menuWidth > window.innerWidth - gap) {
    left = window.innerWidth - menuWidth - gap;
    log("\u{1F4CD} [Mouse] Adjusted for right edge: left =", left);
  }
  if (top + menuHeight > window.innerHeight - gap) {
    top = y - menuHeight - gap;
    log("\u{1F4CD} [Mouse] Adjusted for bottom edge (showing above): top =", top);
    if (top < gap) {
      top = gap;
      log("\u{1F4CD} [Mouse] Adjusted for top edge: top =", top);
    }
  }
  log("\u{1F4CD} [Mouse] Final position: left =", left, ", top =", top);
  const backdrop = document.getElementById("emojiVariantBackdrop");
  if (backdrop) backdrop.style.display = "block";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.display = "block";
  emojiVariantMenuActive = true;
}
function replaceEmojiWithVariant(element, oldEmoji, newEmoji) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const text = element.value;
    const cursorPos = element.selectionStart || 0;
    const before = text.substring(0, cursorPos);
    const after = text.substring(cursorPos);
    const lastIndex = before.lastIndexOf(oldEmoji);
    if (lastIndex !== -1) {
      element.value = before.substring(0, lastIndex) + newEmoji + before.substring(lastIndex + oldEmoji.length) + after;
      element.selectionStart = element.selectionEnd = lastIndex + newEmoji.length;
    }
  } else {
    element.textContent = element.textContent?.replace(oldEmoji, newEmoji) || "";
  }
}
function getEmojiAtPosition(text, position) {
  const chars = Array.from(text);
  let charPos = 0;
  let utf16Pos = 0;
  while (utf16Pos < position && charPos < chars.length) {
    utf16Pos += chars[charPos].length;
    charPos++;
  }
  for (let lookback = 0; lookback <= 3; lookback++) {
    const checkPos = charPos - lookback - 1;
    if (checkPos < 0) break;
    const emoji = chars[checkPos];
    if (emojiVariants[emoji]) {
      return emoji;
    }
    const baseEmoji = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
    if (baseEmoji !== emoji && emojiVariants[baseEmoji]) {
      return baseEmoji;
    }
  }
  return null;
}
function getCaretCoordinates(element, position) {
  const div = document.createElement("div");
  const style = window.getComputedStyle(element);
  const properties = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "text-transform",
    "word-spacing",
    "text-indent",
    "white-space",
    "line-height",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "box-sizing"
  ];
  properties.forEach((prop) => {
    div.style.setProperty(prop, style.getPropertyValue(prop));
  });
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = element.tagName === "TEXTAREA" ? "pre-wrap" : "pre";
  div.style.overflowWrap = "break-word";
  div.style.width = element.offsetWidth + "px";
  div.style.height = element.offsetHeight + "px";
  document.body.appendChild(div);
  const text = element.value.substring(0, position);
  div.textContent = text;
  const span = document.createElement("span");
  span.textContent = element.value.substring(position) || ".";
  div.appendChild(span);
  const rect = element.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const x = spanRect.left;
  const y = spanRect.top;
  document.body.removeChild(div);
  return { x, y };
}
function applyTheme(themeName) {
  document.documentElement.setAttribute("data-theme", themeName);
}
function selectTheme(themeName) {
  state.theme = themeName;
  throttledSave();
  applyTheme(themeName);
  document.querySelectorAll(".theme-option").forEach((option) => {
    option.classList.remove("active");
    if (option.getAttribute("data-theme") === themeName) {
      option.classList.add("active");
    }
  });
  const themeSelector = document.querySelector(".theme-selector");
  const themeOptions = Array.from(themeSelector.querySelectorAll(".theme-option"));
  themeOptions.sort((a, b) => {
    const aActive = a.classList.contains("active") ? 0 : 1;
    const bActive = b.classList.contains("active") ? 0 : 1;
    return aActive - bActive;
  });
  themeSelector.innerHTML = "";
  themeOptions.forEach((option) => themeSelector.appendChild(option));
}
function selectLanguage(lang) {
  state.language = lang;
  throttledSave();
  const selectedLanguageEl = document.getElementById("selectedLanguage");
  if (selectedLanguageEl && translations[lang]) {
    selectedLanguageEl.textContent = translations[lang].name;
  }
  document.querySelectorAll(".language-option").forEach((option) => {
    option.classList.remove("active");
    if (option.getAttribute("data-lang") === lang) {
      option.classList.add("active");
    }
  });
  updateUILanguage();
}
function applyLanguage(lang) {
  const selectedLanguageEl = document.getElementById("selectedLanguage");
  if (selectedLanguageEl && translations[lang]) {
    selectedLanguageEl.textContent = translations[lang].name;
  }
  document.querySelectorAll(".language-option").forEach((option) => {
    option.classList.remove("active");
    if (option.getAttribute("data-lang") === lang) {
      option.classList.add("active");
    }
  });
  updateUILanguage();
}
let draggedChannelId = null;
function setupChannelDragAndDrop() {
  const channelItems = document.querySelectorAll(".channel-item");
  channelItems.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedChannelId = item.getAttribute("data-id");
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      draggedChannelId = null;
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const draggingItem = document.querySelector(".dragging");
      if (!draggingItem) return;
      const rect = item.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        item.classList.add("drag-over-top");
        item.classList.remove("drag-over-bottom");
      } else {
        item.classList.add("drag-over-bottom");
        item.classList.remove("drag-over-top");
      }
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over-top", "drag-over-bottom");
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over-top", "drag-over-bottom");
      const targetId = item.getAttribute("data-id");
      if (!draggedChannelId || !targetId || draggedChannelId === targetId) return;
      const draggedIndex = state.channels.findIndex((c) => c.id === draggedChannelId);
      const targetIndex = state.channels.findIndex((c) => c.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) return;
      const [draggedChannel] = state.channels.splice(draggedIndex, 1);
      state.channels.splice(targetIndex, 0, draggedChannel);
      state.channels.forEach((channel, index) => {
        channel.order = index;
      });
      throttledSave();
      renderChannelsList();
    });
  });
}
let draggedImageIndex = null;
function setupImageDragAndDrop(channel) {
  const galleryItems = document.querySelectorAll(".gallery-item");
  galleryItems.forEach((item, index) => {
    item.setAttribute("draggable", "true");
    item.addEventListener("dragstart", (e) => {
      draggedImageIndex = index;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      draggedImageIndex = null;
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const draggingItem = document.querySelector(".gallery-item.dragging");
      if (!draggingItem) return;
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      if (draggedImageIndex === null || draggedImageIndex === index) return;
      const newImages = [...channel.images];
      const [draggedImage] = newImages.splice(draggedImageIndex, 1);
      newImages.splice(index, 0, draggedImage);
      channel.images = newImages;
      throttledSave();
      renderGallery(channel);
      renderChannelsList();
    });
  });
}
let draggedTagName = null;
function setupTagDragAndDrop() {
  const tagItems = document.querySelectorAll(".existing-tag-item");
  tagItems.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedTagName = item.getAttribute("data-tag");
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      draggedTagName = null;
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const draggingItem = document.querySelector(".existing-tag-item.dragging");
      if (!draggingItem) return;
      const rect = item.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        item.classList.add("drag-over-top");
        item.classList.remove("drag-over-bottom");
      } else {
        item.classList.add("drag-over-bottom");
        item.classList.remove("drag-over-top");
      }
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over-top", "drag-over-bottom");
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over-top", "drag-over-bottom");
      const targetTagName = item.getAttribute("data-tag");
      if (!draggedTagName || !targetTagName || draggedTagName === targetTagName) return;
      const draggedIndex = state.tags.findIndex((t2) => t2 === draggedTagName);
      const targetIndex = state.tags.findIndex((t2) => t2 === targetTagName);
      if (draggedIndex === -1 || targetIndex === -1) return;
      const [draggedTag] = state.tags.splice(draggedIndex, 1);
      state.tags.splice(targetIndex, 0, draggedTag);
      throttledSave();
      renderExistingTags();
      renderFilterTags();
      renderAvailableTags();
    });
  });
}
let selectedImagesForComparison = [];
function toggleImageSelection(imageUrl, itemElement) {
  const index = selectedImagesForComparison.indexOf(imageUrl);
  if (index > -1) {
    selectedImagesForComparison.splice(index, 1);
    itemElement.classList.remove("selected-for-comparison");
  } else {
    selectedImagesForComparison.push(imageUrl);
    itemElement.classList.add("selected-for-comparison");
  }
  updateCompareButton();
}
function updateCompareButton() {
  const compareBtn = document.getElementById("compareImagesBtn");
  const compareCount = document.getElementById("compareCount");
  if (!compareBtn || !compareCount) return;
  if (selectedImagesForComparison.length >= 2) {
    compareBtn.style.display = "flex";
    compareCount.textContent = selectedImagesForComparison.length.toString();
  } else {
    compareBtn.style.display = "none";
  }
}
function openComparisonModal() {
  if (selectedImagesForComparison.length < 2) return;
  const modal = document.getElementById("comparisonModal");
  const container = document.getElementById("comparisonContainer");
  container.innerHTML = selectedImagesForComparison.map((img, index) => `
        <div class="comparison-item">
            <img src="${img}" alt="Comparison ${index + 1}">
            <div class="comparison-item-label">Image ${index + 1}</div>
        </div>
    `).join("");
  modal.classList.add("active");
}
function closeComparisonModal() {
  document.getElementById("comparisonModal").classList.remove("active");
}
function clearComparisonSelection() {
  selectedImagesForComparison = [];
  document.querySelectorAll(".gallery-item").forEach((item) => {
    item.classList.remove("selected-for-comparison");
  });
  updateCompareButton();
  closeComparisonModal();
}
const danbooruTags = [
  // Quality & Rating tags
  { name: "masterpiece", category: "meta" },
  { name: "best quality", category: "meta" },
  { name: "high quality", category: "meta" },
  { name: "absurdres", category: "meta" },
  { name: "highres", category: "meta" },
  { name: "ultra detailed", category: "meta" },
  { name: "4k", category: "meta" },
  { name: "8k", category: "meta" },
  // Common general tags
  { name: "1girl", category: "general" },
  { name: "1boy", category: "general" },
  { name: "2girls", category: "general" },
  { name: "2boys", category: "general" },
  { name: "multiple girls", category: "general" },
  { name: "multiple boys", category: "general" },
  { name: "solo", category: "general" },
  { name: "duo", category: "general" },
  { name: "group", category: "general" },
  { name: "looking at viewer", category: "general" },
  { name: "looking away", category: "general" },
  { name: "looking back", category: "general" },
  { name: "smile", category: "general" },
  { name: "grin", category: "general" },
  { name: "smirk", category: "general" },
  { name: "open mouth", category: "general" },
  { name: "closed mouth", category: "general" },
  { name: "closed eyes", category: "general" },
  { name: "blush", category: "general" },
  { name: "angry", category: "general" },
  { name: "sad", category: "general" },
  { name: "crying", category: "general" },
  { name: "laughing", category: "general" },
  { name: "embarrassed", category: "general" },
  // Hair - Length
  { name: "long hair", category: "general" },
  { name: "very long hair", category: "general" },
  { name: "short hair", category: "general" },
  { name: "medium hair", category: "general" },
  { name: "shoulder-length hair", category: "general" },
  { name: "waist-length hair", category: "general" },
  // Hair - Color
  { name: "blonde hair", category: "general" },
  { name: "brown hair", category: "general" },
  { name: "black hair", category: "general" },
  { name: "white hair", category: "general" },
  { name: "gray hair", category: "general" },
  { name: "silver hair", category: "general" },
  { name: "red hair", category: "general" },
  { name: "blue hair", category: "general" },
  { name: "pink hair", category: "general" },
  { name: "purple hair", category: "general" },
  { name: "green hair", category: "general" },
  { name: "orange hair", category: "general" },
  { name: "multicolored hair", category: "general" },
  { name: "gradient hair", category: "general" },
  { name: "two-tone hair", category: "general" },
  // Hair - Style
  { name: "ponytail", category: "general" },
  { name: "twin tails", category: "general" },
  { name: "side ponytail", category: "general" },
  { name: "braid", category: "general" },
  { name: "single braid", category: "general" },
  { name: "twin braids", category: "general" },
  { name: "french braid", category: "general" },
  { name: "bun", category: "general" },
  { name: "double bun", category: "general" },
  { name: "hair bun", category: "general" },
  { name: "messy hair", category: "general" },
  { name: "wavy hair", category: "general" },
  { name: "curly hair", category: "general" },
  { name: "straight hair", category: "general" },
  { name: "ahoge", category: "general" },
  { name: "bangs", category: "general" },
  { name: "blunt bangs", category: "general" },
  // Eyes - Color
  { name: "blue eyes", category: "general" },
  { name: "red eyes", category: "general" },
  { name: "green eyes", category: "general" },
  { name: "brown eyes", category: "general" },
  { name: "yellow eyes", category: "general" },
  { name: "purple eyes", category: "general" },
  { name: "pink eyes", category: "general" },
  { name: "orange eyes", category: "general" },
  { name: "golden eyes", category: "general" },
  { name: "heterochromia", category: "general" },
  { name: "multicolored eyes", category: "general" },
  // Clothing - Tops
  { name: "shirt", category: "general" },
  { name: "t-shirt", category: "general" },
  { name: "blouse", category: "general" },
  { name: "sweater", category: "general" },
  { name: "hoodie", category: "general" },
  { name: "jacket", category: "general" },
  { name: "coat", category: "general" },
  { name: "cardigan", category: "general" },
  { name: "vest", category: "general" },
  { name: "blazer", category: "general" },
  // Clothing - Bottoms
  { name: "skirt", category: "general" },
  { name: "miniskirt", category: "general" },
  { name: "long skirt", category: "general" },
  { name: "pleated skirt", category: "general" },
  { name: "pants", category: "general" },
  { name: "jeans", category: "general" },
  { name: "shorts", category: "general" },
  { name: "leggings", category: "general" },
  // Clothing - Dresses & Full Body
  { name: "dress", category: "general" },
  { name: "sundress", category: "general" },
  { name: "wedding dress", category: "general" },
  { name: "evening gown", category: "general" },
  { name: "school uniform", category: "general" },
  { name: "sailor uniform", category: "general" },
  { name: "maid outfit", category: "general" },
  { name: "kimono", category: "general" },
  { name: "yukata", category: "general" },
  { name: "armor", category: "general" },
  { name: "military uniform", category: "general" },
  { name: "suit", category: "general" },
  { name: "tuxedo", category: "general" },
  { name: "pajamas", category: "general" },
  { name: "swimsuit", category: "general" },
  { name: "bikini", category: "general" },
  { name: "one-piece swimsuit", category: "general" },
  // Accessories
  { name: "glasses", category: "general" },
  { name: "sunglasses", category: "general" },
  { name: "hat", category: "general" },
  { name: "cap", category: "general" },
  { name: "bow", category: "general" },
  { name: "hair bow", category: "general" },
  { name: "ribbon", category: "general" },
  { name: "hair ribbon", category: "general" },
  { name: "headband", category: "general" },
  { name: "crown", category: "general" },
  { name: "tiara", category: "general" },
  { name: "earrings", category: "general" },
  { name: "necklace", category: "general" },
  { name: "bracelet", category: "general" },
  { name: "gloves", category: "general" },
  { name: "scarf", category: "general" },
  { name: "necktie", category: "general" },
  { name: "bowtie", category: "general" },
  // Backgrounds & Settings
  { name: "outdoors", category: "general" },
  { name: "indoors", category: "general" },
  { name: "city", category: "general" },
  { name: "street", category: "general" },
  { name: "alley", category: "general" },
  { name: "park", category: "general" },
  { name: "forest", category: "general" },
  { name: "mountain", category: "general" },
  { name: "beach", category: "general" },
  { name: "ocean", category: "general" },
  { name: "lake", category: "general" },
  { name: "river", category: "general" },
  { name: "desert", category: "general" },
  { name: "snow", category: "general" },
  { name: "rain", category: "general" },
  { name: "sky", category: "general" },
  { name: "clouds", category: "general" },
  { name: "night", category: "general" },
  { name: "day", category: "general" },
  { name: "sunset", category: "general" },
  { name: "sunrise", category: "general" },
  { name: "twilight", category: "general" },
  { name: "starry sky", category: "general" },
  { name: "moon", category: "general" },
  { name: "stars", category: "general" },
  { name: "cherry blossoms", category: "general" },
  { name: "autumn leaves", category: "general" },
  { name: "flower field", category: "general" },
  { name: "garden", category: "general" },
  { name: "classroom", category: "general" },
  { name: "bedroom", category: "general" },
  { name: "kitchen", category: "general" },
  { name: "library", category: "general" },
  { name: "cafe", category: "general" },
  { name: "restaurant", category: "general" },
  { name: "office", category: "general" },
  { name: "castle", category: "general" },
  { name: "church", category: "general" },
  { name: "temple", category: "general" },
  { name: "shrine", category: "general" },
  // Poses & Actions
  { name: "standing", category: "general" },
  { name: "sitting", category: "general" },
  { name: "lying", category: "general" },
  { name: "kneeling", category: "general" },
  { name: "crouching", category: "general" },
  { name: "walking", category: "general" },
  { name: "running", category: "general" },
  { name: "jumping", category: "general" },
  { name: "flying", category: "general" },
  { name: "fighting", category: "general" },
  { name: "dancing", category: "general" },
  { name: "singing", category: "general" },
  { name: "reading", category: "general" },
  { name: "eating", category: "general" },
  { name: "drinking", category: "general" },
  { name: "sleeping", category: "general" },
  { name: "waving", category: "general" },
  { name: "pointing", category: "general" },
  { name: "reaching", category: "general" },
  { name: "hugging", category: "general" },
  { name: "holding hands", category: "general" },
  // Hand Positions
  { name: "arms up", category: "general" },
  { name: "arms behind back", category: "general" },
  { name: "arms crossed", category: "general" },
  { name: "hand on hip", category: "general" },
  { name: "hand on own face", category: "general" },
  { name: "hand on own cheek", category: "general" },
  { name: "hand in pocket", category: "general" },
  { name: "peace sign", category: "general" },
  { name: "thumbs up", category: "general" },
  { name: "waving", category: "general" },
  // Art Styles
  { name: "anime", category: "meta" },
  { name: "manga", category: "meta" },
  { name: "chibi", category: "meta" },
  { name: "realistic", category: "meta" },
  { name: "photorealistic", category: "meta" },
  { name: "semi-realistic", category: "meta" },
  { name: "sketch", category: "meta" },
  { name: "lineart", category: "meta" },
  { name: "painting", category: "meta" },
  { name: "oil painting", category: "meta" },
  { name: "watercolor", category: "meta" },
  { name: "digital art", category: "meta" },
  { name: "pixel art", category: "meta" },
  { name: "cel shading", category: "meta" },
  { name: "retro style", category: "meta" },
  { name: "vintage", category: "meta" },
  { name: "fantasy", category: "meta" },
  { name: "sci-fi", category: "meta" },
  { name: "cyberpunk", category: "meta" },
  { name: "steampunk", category: "meta" },
  // Composition
  { name: "portrait", category: "general" },
  { name: "upper body", category: "general" },
  { name: "cowboy shot", category: "general" },
  { name: "full body", category: "general" },
  { name: "close-up", category: "general" },
  { name: "face focus", category: "general" },
  { name: "from above", category: "general" },
  { name: "from below", category: "general" },
  { name: "from side", category: "general" },
  { name: "from behind", category: "general" },
  { name: "profile", category: "general" },
  { name: "three-quarter view", category: "general" },
  { name: "dynamic angle", category: "general" },
  { name: "dutch angle", category: "general" },
  // Lighting
  { name: "dramatic lighting", category: "general" },
  { name: "soft lighting", category: "general" },
  { name: "hard lighting", category: "general" },
  { name: "backlighting", category: "general" },
  { name: "rim lighting", category: "general" },
  { name: "sunlight", category: "general" },
  { name: "moonlight", category: "general" },
  { name: "candlelight", category: "general" },
  { name: "god rays", category: "general" },
  { name: "lens flare", category: "general" },
  { name: "volumetric lighting", category: "general" },
  { name: "neon lights", category: "general" },
  { name: "glowing", category: "general" },
  // Effects & Atmosphere
  { name: "depth of field", category: "meta" },
  { name: "bokeh", category: "meta" },
  { name: "bloom", category: "meta" },
  { name: "chromatic aberration", category: "meta" },
  { name: "motion blur", category: "meta" },
  { name: "film grain", category: "meta" },
  { name: "particles", category: "general" },
  { name: "sparkle", category: "general" },
  { name: "light particles", category: "general" },
  { name: "petals", category: "general" },
  { name: "falling petals", category: "general" },
  { name: "bubbles", category: "general" },
  { name: "floating", category: "general" },
  { name: "wind", category: "general" },
  { name: "wind lift", category: "general" },
  // Fantasy & Magical Elements
  { name: "wings", category: "general" },
  { name: "angel wings", category: "general" },
  { name: "demon wings", category: "general" },
  { name: "dragon wings", category: "general" },
  { name: "horns", category: "general" },
  { name: "tail", category: "general" },
  { name: "animal ears", category: "general" },
  { name: "cat ears", category: "general" },
  { name: "fox ears", category: "general" },
  { name: "wolf ears", category: "general" },
  { name: "bunny ears", category: "general" },
  { name: "elf ears", category: "general" },
  { name: "pointy ears", category: "general" },
  { name: "halo", category: "general" },
  { name: "magic", category: "general" },
  { name: "magic circle", category: "general" },
  { name: "spell", category: "general" },
  { name: "staff", category: "general" },
  { name: "wand", category: "general" },
  { name: "sword", category: "general" },
  { name: "katana", category: "general" },
  { name: "weapon", category: "general" },
  // Additional Details
  { name: "detailed background", category: "meta" },
  { name: "simple background", category: "meta" },
  { name: "white background", category: "meta" },
  { name: "black background", category: "meta" },
  { name: "gradient background", category: "meta" },
  { name: "transparent background", category: "meta" },
  { name: "cinematic", category: "meta" },
  { name: "epic", category: "meta" },
  { name: "beautiful", category: "meta" },
  { name: "cute", category: "meta" },
  { name: "elegant", category: "meta" },
  { name: "dynamic pose", category: "general" },
  { name: "detailed eyes", category: "meta" },
  { name: "detailed face", category: "meta" },
  // Body Features & Proportions
  { name: "tall", category: "general" },
  { name: "short", category: "general" },
  { name: "slender", category: "general" },
  { name: "muscular", category: "general" },
  { name: "slim", category: "general" },
  { name: "petite", category: "general" },
  { name: "curvy", category: "general" },
  // Facial Features
  { name: "freckles", category: "general" },
  { name: "mole", category: "general" },
  { name: "beauty mark", category: "general" },
  { name: "scar", category: "general" },
  { name: "facial mark", category: "general" },
  { name: "makeup", category: "general" },
  { name: "lipstick", category: "general" },
  { name: "eyeliner", category: "general" },
  { name: "eyeshadow", category: "general" },
  // More Expressions
  { name: "wink", category: "general" },
  { name: "tongue out", category: "general" },
  { name: "pout", category: "general" },
  { name: "serious", category: "general" },
  { name: "determined", category: "general" },
  { name: "surprised", category: "general" },
  { name: "shocked", category: "general" },
  { name: "scared", category: "general" },
  { name: "nervous", category: "general" },
  { name: "sleepy", category: "general" },
  { name: "tired", category: "general" },
  { name: "expressionless", category: "general" },
  // More Hair Styles
  { name: "pigtails", category: "general" },
  { name: "drill hair", category: "general" },
  { name: "spiky hair", category: "general" },
  { name: "hair over one eye", category: "general" },
  { name: "hair between eyes", category: "general" },
  { name: "hair behind ear", category: "general" },
  { name: "hair ornament", category: "general" },
  { name: "hairclip", category: "general" },
  { name: "hair flower", category: "general" },
  { name: "side braid", category: "general" },
  { name: "wet hair", category: "general" },
  { name: "floating hair", category: "general" },
  // Footwear
  { name: "shoes", category: "general" },
  { name: "boots", category: "general" },
  { name: "high heels", category: "general" },
  { name: "sneakers", category: "general" },
  { name: "sandals", category: "general" },
  { name: "slippers", category: "general" },
  { name: "barefoot", category: "general" },
  // Legwear
  { name: "thighhighs", category: "general" },
  { name: "stockings", category: "general" },
  { name: "pantyhose", category: "general" },
  { name: "knee socks", category: "general" },
  { name: "socks", category: "general" },
  { name: "fishnet", category: "general" },
  // Weather & Time
  { name: "cloudy", category: "general" },
  { name: "foggy", category: "general" },
  { name: "storm", category: "general" },
  { name: "lightning", category: "general" },
  { name: "rainbow", category: "general" },
  { name: "dawn", category: "general" },
  { name: "dusk", category: "general" },
  { name: "midnight", category: "general" },
  { name: "golden hour", category: "general" },
  { name: "blue hour", category: "general" },
  // Nature Elements
  { name: "tree", category: "general" },
  { name: "grass", category: "general" },
  { name: "flowers", category: "general" },
  { name: "rose", category: "general" },
  { name: "lily", category: "general" },
  { name: "sunflower", category: "general" },
  { name: "leaves", category: "general" },
  { name: "vines", category: "general" },
  { name: "water", category: "general" },
  { name: "waterfall", category: "general" },
  { name: "ripples", category: "general" },
  { name: "waves", category: "general" },
  { name: "fire", category: "general" },
  { name: "flames", category: "general" },
  { name: "smoke", category: "general" },
  { name: "mist", category: "general" },
  { name: "fog", category: "general" },
  // Animals & Creatures
  { name: "cat", category: "general" },
  { name: "dog", category: "general" },
  { name: "bird", category: "general" },
  { name: "butterfly", category: "general" },
  { name: "dragon", category: "general" },
  { name: "phoenix", category: "general" },
  { name: "wolf", category: "general" },
  { name: "fox", category: "general" },
  { name: "deer", category: "general" },
  { name: "rabbit", category: "general" },
  { name: "fish", category: "general" },
  { name: "snake", category: "general" },
  // Objects & Items
  { name: "book", category: "general" },
  { name: "cup", category: "general" },
  { name: "teacup", category: "general" },
  { name: "umbrella", category: "general" },
  { name: "parasol", category: "general" },
  { name: "fan", category: "general" },
  { name: "phone", category: "general" },
  { name: "bag", category: "general" },
  { name: "backpack", category: "general" },
  { name: "flower basket", category: "general" },
  { name: "lantern", category: "general" },
  { name: "candle", category: "general" },
  { name: "lamp", category: "general" },
  { name: "mirror", category: "general" },
  { name: "window", category: "general" },
  { name: "door", category: "general" },
  { name: "chair", category: "general" },
  { name: "table", category: "general" },
  { name: "bed", category: "general" },
  { name: "bench", category: "general" },
  // Weapons & Combat
  { name: "bow (weapon)", category: "general" },
  { name: "arrow", category: "general" },
  { name: "spear", category: "general" },
  { name: "axe", category: "general" },
  { name: "dagger", category: "general" },
  { name: "shield", category: "general" },
  { name: "gun", category: "general" },
  { name: "rifle", category: "general" },
  { name: "pistol", category: "general" },
  { name: "scythe", category: "general" },
  { name: "holding weapon", category: "general" },
  { name: "dual wielding", category: "general" },
  { name: "sheathed", category: "general" },
  { name: "unsheathing", category: "general" },
  // Food & Drink
  { name: "food", category: "general" },
  { name: "tea", category: "general" },
  { name: "coffee", category: "general" },
  { name: "cake", category: "general" },
  { name: "bread", category: "general" },
  { name: "fruit", category: "general" },
  { name: "apple", category: "general" },
  { name: "strawberry", category: "general" },
  { name: "ice cream", category: "general" },
  { name: "candy", category: "general" },
  { name: "chocolate", category: "general" },
  // Music & Instruments
  { name: "music", category: "general" },
  { name: "musical note", category: "general" },
  { name: "piano", category: "general" },
  { name: "guitar", category: "general" },
  { name: "violin", category: "general" },
  { name: "flute", category: "general" },
  { name: "microphone", category: "general" },
  { name: "headphones", category: "general" },
  // Celestial & Space
  { name: "planet", category: "general" },
  { name: "galaxy", category: "general" },
  { name: "constellation", category: "general" },
  { name: "comet", category: "general" },
  { name: "meteor", category: "general" },
  { name: "shooting star", category: "general" },
  { name: "nebula", category: "general" },
  { name: "space", category: "general" },
  // Architecture
  { name: "building", category: "general" },
  { name: "tower", category: "general" },
  { name: "bridge", category: "general" },
  { name: "stairs", category: "general" },
  { name: "balcony", category: "general" },
  { name: "rooftop", category: "general" },
  { name: "ruins", category: "general" },
  { name: "pillar", category: "general" },
  { name: "arch", category: "general" },
  { name: "gate", category: "general" },
  { name: "fence", category: "general" },
  { name: "wall", category: "general" },
  // Vehicles
  { name: "car", category: "general" },
  { name: "motorcycle", category: "general" },
  { name: "bicycle", category: "general" },
  { name: "train", category: "general" },
  { name: "airplane", category: "general" },
  { name: "helicopter", category: "general" },
  { name: "ship", category: "general" },
  { name: "boat", category: "general" },
  // Character Types & Roles
  { name: "maid", category: "general" },
  { name: "nurse", category: "general" },
  { name: "teacher", category: "general" },
  { name: "student", category: "general" },
  { name: "warrior", category: "general" },
  { name: "knight", category: "general" },
  { name: "samurai", category: "general" },
  { name: "ninja", category: "general" },
  { name: "mage", category: "general" },
  { name: "wizard", category: "general" },
  { name: "witch", category: "general" },
  { name: "priest", category: "general" },
  { name: "archer", category: "general" },
  { name: "assassin", category: "general" },
  { name: "pirate", category: "general" },
  { name: "idol", category: "general" },
  { name: "angel", category: "general" },
  { name: "demon", category: "general" },
  { name: "vampire", category: "general" },
  { name: "ghost", category: "general" },
  { name: "robot", category: "general" },
  { name: "android", category: "general" },
  { name: "cyborg", category: "general" },
  { name: "elf", category: "general" },
  { name: "fairy", category: "general" },
  { name: "mermaid", category: "general" },
  { name: "kemonomimi", category: "general" },
  { name: "furry", category: "general" },
  // Additional Poses
  { name: "leaning", category: "general" },
  { name: "leaning forward", category: "general" },
  { name: "leaning back", category: "general" },
  { name: "stretching", category: "general" },
  { name: "yawning", category: "general" },
  { name: "praying", category: "general" },
  { name: "bowing", category: "general" },
  { name: "curtsy", category: "general" },
  { name: "salute", category: "general" },
  { name: "crossed legs", category: "general" },
  { name: "legs up", category: "general" },
  { name: "indian style", category: "general" },
  // Seasonal & Holiday
  { name: "spring", category: "general" },
  { name: "summer", category: "general" },
  { name: "autumn", category: "general" },
  { name: "fall", category: "general" },
  { name: "winter", category: "general" },
  { name: "christmas", category: "general" },
  { name: "halloween", category: "general" },
  { name: "new year", category: "general" },
  { name: "valentine", category: "general" },
  // Patterns & Textures
  { name: "striped", category: "general" },
  { name: "plaid", category: "general" },
  { name: "polka dot", category: "general" },
  { name: "checkered", category: "general" },
  { name: "floral print", category: "general" },
  { name: "lace", category: "general" },
  { name: "frills", category: "general" },
  // Additional Art Styles & Quality
  { name: "3d", category: "meta" },
  { name: "2d", category: "meta" },
  { name: "traditional media", category: "meta" },
  { name: "concept art", category: "meta" },
  { name: "illustration", category: "meta" },
  { name: "comic", category: "meta" },
  { name: "monochrome", category: "meta" },
  { name: "grayscale", category: "meta" },
  { name: "sepia", category: "meta" },
  { name: "lineless", category: "meta" },
  { name: "sharp focus", category: "meta" },
  { name: "highly detailed", category: "meta" },
  { name: "intricate", category: "meta" },
  { name: "professional", category: "meta" },
  { name: "award winning", category: "meta" },
  { name: "trending on artstation", category: "meta" },
  // Colors & Tones
  { name: "colorful", category: "general" },
  { name: "vibrant", category: "general" },
  { name: "pastel colors", category: "general" },
  { name: "warm colors", category: "general" },
  { name: "cool colors", category: "general" },
  { name: "neon colors", category: "general" },
  { name: "dark", category: "general" },
  { name: "bright", category: "general" },
  // Special Effects
  { name: "reflection", category: "general" },
  { name: "refraction", category: "general" },
  { name: "mirror", category: "general" },
  { name: "silhouette", category: "general" },
  { name: "shadow", category: "general" },
  { name: "contrast", category: "general" },
  { name: "vignette", category: "meta" },
  { name: "symmetry", category: "general" },
  { name: "asymmetry", category: "general" }
];
let tagWorker = null;
function initTagWorker() {
  try {
    tagWorker = new Worker("./tag-worker.js");
    tagWorker.addEventListener("message", (e) => {
      const { type, data } = e.data;
      if (type === "ready") {
        log("\u2705 Tag search worker initialized");
      } else if (type === "results") {
        renderAutocompleteResults(data);
      }
    });
    tagWorker.addEventListener("error", (error2) => {
      error2("Tag worker error:", error2);
      tagWorker = null;
    });
    const allTags = [...danbooruTags, ...customDanbooruTags];
    tagWorker.postMessage({ type: "init", data: { tags: allTags } });
  } catch (error2) {
    warn("\u26A0\uFE0F Web Worker not supported, using main thread for tag search");
    tagWorker = null;
  }
}
function updateTagWorker() {
  if (tagWorker) {
    const allTags = [...danbooruTags, ...customDanbooruTags];
    tagWorker.postMessage({ type: "update", data: { tags: allTags } });
  }
}
let currentTextarea = null;
const debouncedAutocomplete = debounce((query, textarea) => {
  currentTextarea = textarea;
  if (tagWorker) {
    tagWorker.postMessage({ type: "search", data: { query, limit: 10 } });
  } else {
    showTagAutocomplete(query, textarea);
  }
}, 150);
function showTagAutocomplete(query, textarea) {
  const autocomplete = document.getElementById("tagAutocomplete");
  if (!query || query.length < 2) {
    autocomplete.style.display = "none";
    return;
  }
  const allTags = [...danbooruTags, ...customDanbooruTags];
  const lowerQuery = query.toLowerCase();
  const startsWithMatches = [];
  const containsMatches = [];
  for (let i = 0; i < allTags.length && startsWithMatches.length + containsMatches.length < 50; i++) {
    const tag = allTags[i];
    const tagLower = tag.name.toLowerCase();
    if (tagLower.startsWith(lowerQuery)) {
      startsWithMatches.push(tag);
    } else if (tagLower.includes(lowerQuery)) {
      containsMatches.push(tag);
    }
  }
  autocompleteItems = [...startsWithMatches, ...containsMatches].slice(0, 10);
  renderAutocompleteResults(autocompleteItems, textarea);
}
function renderAutocompleteResults(items, textarea) {
  const autocomplete = document.getElementById("tagAutocomplete");
  const targetTextarea = textarea || currentTextarea;
  if (!targetTextarea) return;
  autocompleteItems = items;
  if (autocompleteItems.length === 0) {
    autocomplete.style.display = "none";
    return;
  }
  autocomplete.innerHTML = autocompleteItems.map((tag, index) => `
        <div class="tag-autocomplete-item ${index === autocompleteSelectedIndex ? "selected" : ""}" data-index="${index}">
            <span class="tag-name">${tag.name}</span>
            <span class="tag-category ${tag.category}">${tag.category}</span>
        </div>
    `).join("");
  autocomplete.style.display = "block";
  autocomplete.querySelectorAll(".tag-autocomplete-item").forEach((item) => {
    item.addEventListener("click", () => {
      const index = parseInt(item.getAttribute("data-index") || "0");
      insertTag(autocompleteItems[index].name, targetTextarea);
    });
  });
}
function insertTag(tagName, textarea) {
  const cursorPos = textarea.selectionStart;
  const textBefore = textarea.value.substring(0, cursorPos);
  const textAfter = textarea.value.substring(cursorPos);
  const lastComma = textBefore.lastIndexOf(",");
  const wordStart = lastComma >= 0 ? lastComma + 1 : 0;
  const beforeWord = textarea.value.substring(0, wordStart);
  const newText = beforeWord + (beforeWord.trim() && !beforeWord.endsWith(",") ? ", " : "") + tagName + ", " + textAfter;
  textarea.value = newText;
  const newCursorPos = (beforeWord + (beforeWord.trim() && !beforeWord.endsWith(",") ? ", " : "") + tagName + ", ").length;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  textarea.focus();
  document.getElementById("tagAutocomplete").style.display = "none";
  autocompleteSelectedIndex = -1;
}
function getCurrentWord(text, cursorPos) {
  const textBefore = text.substring(0, cursorPos);
  const lastComma = textBefore.lastIndexOf(",");
  const word = textBefore.substring(lastComma + 1).trim();
  return word;
}
function handleAutocompleteKeydown(e, textarea) {
  const autocomplete = document.getElementById("tagAutocomplete");
  if (autocomplete.style.display === "none") {
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex + 1, autocompleteItems.length - 1);
    updateAutocompleteSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, -1);
    updateAutocompleteSelection();
  } else if (e.key === "Enter" || e.key === "Tab") {
    if (autocompleteSelectedIndex >= 0) {
      e.preventDefault();
      insertTag(autocompleteItems[autocompleteSelectedIndex].name, textarea);
    }
  } else if (e.key === "Escape") {
    autocomplete.style.display = "none";
    autocompleteSelectedIndex = -1;
  }
}
function updateAutocompleteSelection() {
  const items = document.querySelectorAll(".tag-autocomplete-item");
  items.forEach((item, index) => {
    if (index === autocompleteSelectedIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });
}
let danbooruTagsPage = 0;
const DANBOORU_TAGS_PER_PAGE = 50;
let danbooruSearchQuery = "";
function renderDanbooruTags() {
  const tagsList = document.getElementById("danbooruTagsList");
  let filteredTags = customDanbooruTags;
  if (danbooruSearchQuery) {
    const query = danbooruSearchQuery.toLowerCase();
    filteredTags = customDanbooruTags.filter(
      (tag) => tag.name.toLowerCase().includes(query)
    );
  }
  if (filteredTags.length === 0) {
    if (danbooruSearchQuery) {
      tagsList.innerHTML = '<p style="color: var(--silver); text-align: center; padding: 20px;">No tags match your search</p>';
    } else {
      tagsList.innerHTML = '<p style="color: var(--silver); text-align: center; padding: 20px;">No custom tags added yet</p>';
    }
    return;
  }
  const sortedTags = [...filteredTags].sort(
    (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
  const totalPages = Math.ceil(sortedTags.length / DANBOORU_TAGS_PER_PAGE);
  const startIndex = danbooruTagsPage * DANBOORU_TAGS_PER_PAGE;
  const endIndex = Math.min(startIndex + DANBOORU_TAGS_PER_PAGE, sortedTags.length);
  const visibleTags = sortedTags.slice(startIndex, endIndex);
  const tagsHTML = visibleTags.map((tag) => {
    const originalIndex = customDanbooruTags.findIndex((t2) => t2.name === tag.name && t2.category === tag.category);
    return `
        <div class="danbooru-tag-item">
            <div class="danbooru-tag-info">
                <span class="danbooru-tag-name">${tag.name}</span>
                <span class="danbooru-tag-category-badge ${tag.category}">${tag.category}</span>
            </div>
            <button class="btn-delete-danbooru-tag" data-index="${originalIndex}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;
  }).join("");
  const paginationHTML = totalPages > 1 ? `
        <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 16px; padding: 12px; border-top: 1px solid var(--burgundy-dark);">
            <button id="prevDanbooruPage" style="padding: 6px 12px; background: var(--burgundy-light); border: 1px solid var(--silver); border-radius: 6px; color: var(--cream); cursor: pointer;">
                Previous
            </button>
            <span style="color: var(--silver); font-size: 14px;">
                ${danbooruTagsPage + 1} / ${totalPages} (${sortedTags.length} tags)
            </span>
            <button id="nextDanbooruPage" style="padding: 6px 12px; background: var(--burgundy-light); border: 1px solid var(--silver); border-radius: 6px; color: var(--cream); cursor: pointer;">
                Next
            </button>
        </div>
    ` : `<p style="color: var(--silver); text-align: center; margin-top: 12px; font-size: 14px;">${sortedTags.length} tags total</p>`;
  tagsList.innerHTML = tagsHTML + paginationHTML;
  tagsList.querySelectorAll(".btn-delete-danbooru-tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index") || "0");
      deleteDanbooruTag(index);
    });
  });
  if (totalPages > 1) {
    document.getElementById("prevDanbooruPage")?.addEventListener("click", () => {
      if (danbooruTagsPage > 0) {
        danbooruTagsPage--;
      } else {
        danbooruTagsPage = totalPages - 1;
      }
      renderDanbooruTags();
    });
    document.getElementById("nextDanbooruPage")?.addEventListener("click", () => {
      if (danbooruTagsPage < totalPages - 1) {
        danbooruTagsPage++;
      } else {
        danbooruTagsPage = 0;
      }
      renderDanbooruTags();
    });
  }
}
function addDanbooruTag() {
  const input = document.getElementById("newDanbooruTagInput");
  const select = document.getElementById("danbooruCategorySelect");
  const tagName = input.value.trim().toLowerCase();
  const category = select.value;
  if (!tagName) {
    const btn = document.getElementById("addDanbooruTagBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  const exists = customDanbooruTags.some((tag) => tag.name === tagName) || danbooruTags.some((tag) => tag.name === tagName);
  if (exists) {
    const btn = document.getElementById("addDanbooruTagBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  customDanbooruTags.push({ name: tagName, category });
  input.value = "";
  renderDanbooruTags();
  updateTagWorker();
  throttledSave();
}
function deleteDanbooruTag(index) {
  customDanbooruTags.splice(index, 1);
  renderDanbooruTags();
  updateTagWorker();
  throttledSave();
}
function bulkImportDanbooruTags() {
  const textarea = document.getElementById("bulkDanbooruInput");
  const select = document.getElementById("danbooruCategorySelect");
  const input = textarea.value.trim();
  const category = select.value;
  if (!input) {
    const btn = document.getElementById("bulkImportBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  const tagNames = input.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  if (tagNames.length === 0) {
    const btn = document.getElementById("bulkImportBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  let addedCount = 0;
  tagNames.forEach((tagName) => {
    const exists = customDanbooruTags.some((tag) => tag.name === tagName) || danbooruTags.some((tag) => tag.name === tagName);
    if (!exists) {
      customDanbooruTags.push({ name: tagName, category });
      addedCount++;
    }
  });
  if (addedCount === 0) {
    const btn = document.getElementById("bulkImportBtn");
    if (btn) {
      shakeElement(btn);
    }
    return;
  }
  textarea.value = "";
  renderDanbooruTags();
  updateTagWorker();
  throttledSave();
  if (addedCount < tagNames.length) {
    alert(`Added ${addedCount} new tag(s). ${tagNames.length - addedCount} tag(s) already existed.`);
  }
}
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      openChannelModal();
    }
    if (e.key === "Escape") {
      const activeModals2 = document.querySelectorAll(".modal.active");
      activeModals2.forEach((modal) => {
        if (modal.id === "channelModal") closeChannelModal();
        if (modal.id === "tagsModal") closeTagsModal();
        if (modal.id === "imageModal") closeImageModal();
        if (modal.id === "settingsModal") closeSettingsModal();
        if (modal.id === "galleryModal") closeGalleryModal();
        if (modal.id === "danbooruTagManagerModal") closeDanbooruTagManagerModal();
        if (modal.id === "comparisonModal") closeComparisonModal();
        if (modal.id === "confirmModal") closeConfirmModal(false);
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      exportData();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      const searchInput = document.getElementById("searchInput");
      searchInput?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    const imageModal = document.getElementById("imageModal");
    if (imageModal?.classList.contains("active")) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateImage("prev");
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateImage("next");
      }
    }
    const activeModals = document.querySelectorAll(".modal.active");
    const isFocusedOnInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
    if (activeModals.length === 0 && !isFocusedOnInput) {
      if (e.key === "ArrowLeft") {
        const prevBtn = document.getElementById("prevChannelPage");
        if (prevBtn) {
          e.preventDefault();
          prevBtn.click();
        }
      }
      if (e.key === "ArrowRight") {
        const nextBtn = document.getElementById("nextChannelPage");
        if (nextBtn) {
          e.preventDefault();
          nextBtn.click();
        }
      }
    }
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupKeyboardShortcuts);
} else {
  setupKeyboardShortcuts();
}
