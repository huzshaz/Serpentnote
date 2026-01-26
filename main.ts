// Serpentnote - Enhanced Version 3.0 - Optimized Build

// Debug mode - set to false for production
const DEBUG = true;
const log = DEBUG ? console.log.bind(console) : () => {};
const warn = DEBUG ? console.warn.bind(console) : () => {};
const error = console.error.bind(console); // Always show errors

// Centralized Theme Utility
const Theme = {
    get current(): string {
        return document.documentElement.getAttribute('data-theme') || 'light';
    },

    isOLED(): boolean {
        return this.current === 'oled-black';
    },

    isLight(): boolean {
        return this.current === 'light';
    },

    set(themeName: string): void {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('theme', themeName);
    },

    getBg(): string {
        return this.isOLED() ? '#000000' : '#FFFFFF';
    },

    getModalBg(): string {
        return this.isOLED()
            ? 'rgba(0, 0, 0, 0.98)'
            : 'rgba(250, 250, 250, 0.98)';
    },

    getContentBg(): string {
        return this.isOLED() ? '#000000' : '#FFFFFF';
    },

    getBorderColor(): string {
        return this.isOLED() ? '#1E1E1E' : '#E0E0E0';
    }
};

// Declare Electron API types
declare global {
    interface Window {
        electronAPI?: {
            isElectron: boolean;
            platform: string;
            openDirectory: () => Promise<string | null>;
            writeFile: (path: string, data: string) => Promise<{ success: boolean; error?: string }>;
            readFile: (path: string) => Promise<{ success: boolean; data?: string; error?: string }>;
            copyFile: (source: string, dest: string) => Promise<{ success: boolean; error?: string }>;
            readdir: (path: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;
            mkdir: (path: string) => Promise<{ success: boolean; error?: string }>;
            unlink: (path: string) => Promise<{ success: boolean; error?: string }>;
            stat: (path: string) => Promise<{ success: boolean; stats?: any; error?: string }>;
            rmdir: (path: string) => Promise<{ success: boolean; error?: string }>;
        };
    }
}

// Storage adapter that works with both browser localStorage and Electron file system
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
let electronDataPath: string | null = null;

// IndexedDB wrapper for browser mode (better than localStorage)
const DB_NAME = 'SerpentNote';
const DB_VERSION = 1;
const STORE_NAME = 'data';

let db: IDBDatabase | null = null;

async function initIndexedDB(): Promise<void> {
    if (isElectron) return; // Only use IndexedDB in browser mode

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function indexedDBSet(key: string, value: string): Promise<void> {
    if (!db) return;

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function indexedDBGet(key: string): Promise<string | null> {
    if (!db) return null;

    return new Promise((resolve, reject) => {
        const transaction = db!.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function initElectronStorage() {
    if (!isElectron) return;

    // Always use ./serpentnote-data in the app's root directory
    electronDataPath = './serpentnote-data';

    // Create serpentnote data directory if it doesn't exist
    await window.electronAPI!.mkdir(`${electronDataPath}`);
    await window.electronAPI!.mkdir(`${electronDataPath}/images`);
}

async function storageSet(key: string, value: string) {
    if (isElectron && electronDataPath) {
        // Electron mode: use file system in ./serpentnote-data
        const filePath = `${electronDataPath}/${key}.json`;
        await window.electronAPI!.writeFile(filePath, value);
    } else if (db) {
        // Browser mode with IndexedDB
        await indexedDBSet(key, value);
    } else {
        // Fallback to localStorage
        localStorage.setItem(key, value);
    }
}

async function storageGet(key: string): Promise<string | null> {
    if (isElectron && electronDataPath) {
        // Electron mode: use file system in ./serpentnote-data
        const filePath = `${electronDataPath}/${key}.json`;
        const result = await window.electronAPI!.readFile(filePath);
        return result.success ? result.data! : null;
    } else if (db) {
        // Browser mode with IndexedDB
        return await indexedDBGet(key);
    } else {
        // Fallback to localStorage
        return localStorage.getItem(key);
    }
}

async function saveImageToElectron(base64Data: string, filename: string): Promise<string | null> {
    if (!isElectron || !electronDataPath) return null;

    try {
        const imagePath = `${electronDataPath}/images/${filename}`;
        await window.electronAPI!.writeFile(imagePath, base64Data);
        return imagePath;
    } catch (error) {
        error('Failed to save image:', error);
        return null;
    }
}

async function deleteImageFromElectron(imagePath: string): Promise<boolean> {
    if (!isElectron || !electronDataPath) return false;

    try {
        const result = await window.electronAPI!.unlink(imagePath);
        return result.success;
    } catch (error) {
        error('Failed to delete image:', error);
        return false;
    }
}

// Utility: Debounce function
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: number | null = null;
    return function(...args: Parameters<T>) {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = window.setTimeout(() => func(...args), wait);
    };
}

// Utility: Throttle function for save operations
function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;
    let lastArgs: Parameters<T> | null = null;

    return function(...args: Parameters<T>) {
        lastArgs = args;

        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            lastArgs = null;

            setTimeout(() => {
                inThrottle = false;
                // If there were additional calls during throttle, execute with latest args
                if (lastArgs !== null) {
                    func(...lastArgs);
                    lastArgs = null;
                }
            }, limit);
        }
    };
}

// Utility: Check localStorage quota
function checkStorageQuota(): { used: number; available: number; percentage: number } {
    let used = 0;
    for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            used += localStorage[key].length + key.length;
        }
    }

    // Most browsers allocate 5-10MB for localStorage
    const available = 10 * 1024 * 1024; // 10MB estimate
    const percentage = (used / available) * 100;

    return { used, available, percentage };
}

// Utility: Show storage warning
function showStorageWarning(percentage: number) {
    if (percentage > 80 && percentage < 95) {
        showToast(`⚠️ Storage ${percentage.toFixed(0)}% full. Consider exporting and clearing old data.`, 'warning', 5000);
    }
}

// Toast notification system
function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Icon based on type
    const icon = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    }[type];

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Data structures
interface Channel {
    id: string;
    name: string;
    prompt: string;
    promptVariants?: string[]; // Array of alternate prompts
    activeVariantIndex?: number; // Currently selected variant (0 = main prompt)
    negativePrompt?: string;
    negativePromptVariants?: string[]; // Array of alternate negative prompts
    activeNegativeVariantIndex?: number; // Currently selected negative variant
    tags: string[];
    images: string[];
    createdAt: number;
    starred?: boolean;
    order?: number;
}

interface AppState {
    channels: Channel[];
    tags: string[];
    activeChannelId: string | null;
    activeFilter: string;
    activeFilters: string[];
    theme: string;
    language: string;
    searchQuery: string;
    currentTagPage: number;
    tagsPerPage: number;
}

// Undo/Redo system
interface UndoAction {
    type: 'delete-channel' | 'delete-image' | 'delete-tag';
    data: any;
    timestamp: number;
}

const undoStack: UndoAction[] = [];
const MAX_UNDO_STACK = 10;

function addUndoAction(action: UndoAction) {
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
    }
    showUndoToast();
}

function undo() {
    const action = undoStack.pop();
    if (!action) return;

    if (action.type === 'delete-channel') {
        const channel = action.data as Channel;
        state.channels.push(channel);
        saveToStorage();
        renderChannelsList();
        renderFilterTags();
        selectChannel(channel.id);

        const message = document.createElement('div');
        message.textContent = `✓ Channel "${channel.name}" restored`;
        message.style.position = 'fixed';
        message.style.top = '20px';
        message.style.left = '50%';
        message.style.transform = 'translateX(-50%)';
        message.style.background = '#34c759';
        message.style.color = 'white';
        message.style.padding = '12px 24px';
        message.style.borderRadius = '8px';
        message.style.fontWeight = '600';
        message.style.zIndex = '3001';
        message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        document.body.appendChild(message);
        setTimeout(() => document.body.removeChild(message), 3000);
    } else if (action.type === 'delete-image') {
        const { channelId, imageUrl, index } = action.data;
        const channel = state.channels.find(c => c.id === channelId);
        if (channel) {
            channel.images.splice(index, 0, imageUrl);
            saveToStorage();
            renderGallery(channel);
            renderChannelsList();

            const message = document.createElement('div');
            message.textContent = '✓ Image restored';
            message.style.position = 'fixed';
            message.style.top = '20px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.background = '#34c759';
            message.style.color = 'white';
            message.style.padding = '12px 24px';
            message.style.borderRadius = '8px';
            message.style.fontWeight = '600';
            message.style.zIndex = '3001';
            message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            document.body.appendChild(message);
            setTimeout(() => document.body.removeChild(message), 3000);
        }
    } else if (action.type === 'delete-tag') {
        const { tagName, affectedChannels } = action.data;
        state.tags.push(tagName);
        affectedChannels.forEach((channelData: any) => {
            const channel = state.channels.find(c => c.id === channelData.id);
            if (channel) {
                channel.tags = channelData.tags;
            }
        });
        saveToStorage();
        renderExistingTags();
        renderFilterTags();
        renderChannelsList();

        const message = document.createElement('div');
        message.textContent = `✓ Tag "${tagName}" restored`;
        message.style.position = 'fixed';
        message.style.top = '20px';
        message.style.left = '50%';
        message.style.transform = 'translateX(-50%)';
        message.style.background = '#34c759';
        message.style.color = 'white';
        message.style.padding = '12px 24px';
        message.style.borderRadius = '8px';
        message.style.fontWeight = '600';
        message.style.zIndex = '3001';
        message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        document.body.appendChild(message);
        setTimeout(() => document.body.removeChild(message), 3000);
    }
}

function showUndoToast() {
    // Remove existing toast if any
    const existingToast = document.getElementById('undoToast');
    if (existingToast) {
        document.body.removeChild(existingToast);
    }

    const toast = document.createElement('div');
    toast.id = 'undoToast';
    toast.innerHTML = `
        <span>Deleted</span>
        <button id="undoBtn">Undo</button>
    `;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#2c2c2e';
    toast.style.color = 'white';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '8px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '3001';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    toast.style.display = 'flex';
    toast.style.gap = '16px';
    toast.style.alignItems = 'center';

    const undoBtn = toast.querySelector('#undoBtn') as HTMLButtonElement;
    undoBtn.style.background = '#0a84ff';
    undoBtn.style.color = 'white';
    undoBtn.style.border = 'none';
    undoBtn.style.padding = '6px 12px';
    undoBtn.style.borderRadius = '6px';
    undoBtn.style.cursor = 'pointer';
    undoBtn.style.fontWeight = '600';
    undoBtn.style.fontSize = '14px';

    undoBtn.addEventListener('click', () => {
        undo();
        document.body.removeChild(toast);
    });

    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 5000);
}

// State management
let state: AppState = {
    channels: [],
    tags: [],
    activeChannelId: null,
    activeFilter: 'all',
    activeFilters: [],
    theme: 'oled-black',
    language: 'en',
    searchQuery: '',
    currentTagPage: 0,
    tagsPerPage: 15
};

// Danbooru tag autocomplete
interface DanbooruTag {
    name: string;
    category: 'general' | 'artist' | 'character' | 'copyright' | 'meta';
}

let autocompleteSelectedIndex = -1;
let autocompleteItems: DanbooruTag[] = [];
let customDanbooruTags: DanbooruTag[] = [];

// Local storage keys
const STORAGE_KEYS = {
    CHANNELS: 'serpentsBook_channels',
    TAGS: 'serpentsBook_tags',
    THEME: 'serpentsBook_theme',
    LANGUAGE: 'serpentsBook_language',
    DANBOORU_TAGS: 'serpentsBook_danbooruTags'
};

// Language translations
const translations: Record<string, Record<string, string>> = {
    en: {
        name: 'English',
        appTitle: 'Serpentnote',
        settings: 'Settings',
        newChannel: 'New Channel',
        manageTags: 'Manage Tags',
        filterByTags: 'Filter by Tags',
        allChannels: 'All Channels',
        channels: 'Channels',
        gallery: 'Gallery',
        uploadImage: 'Upload Image',
        noImages: 'No images yet. Double-click or drag & drop to upload!',
        prompt: 'Prompt',
        copy: 'Copy',
        edit: 'Edit',
        delete: 'Delete',
        cancel: 'Cancel',
        save: 'Save',
        channelName: 'Channel Name',
        tags: 'Tags',
        addTag: 'Add tag...',
        createNewTag: 'Create New Tag',
        add: 'Add',
        theme: 'Theme',
        colorTheme: 'Color Theme',
        themeDescription: 'Choose your preferred visual theme',
        light: 'Light',
        oledBlack: 'OLED Black',
        language: 'Language',
        uiLanguage: 'UI Language',
        languageDescription: 'Choose your preferred interface language',
        manageDanbooruTags: 'Manage Danbooru Tags',
        dataManagement: 'Data Management',
        exportData: 'Export All Data',
        exportDescription: 'Download all channels, prompts, tags, and images as a JSON file',
        exportBtn: 'Export',
        importData: 'Import Data',
        importDescription: 'Import previously exported data (replaces current data)',
        importBtn: 'Import',
        clearData: 'Clear All Data',
        clearDescription: 'Permanently delete all channels, prompts, tags, and images',
        clearBtn: 'Clear All',
        statistics: 'Statistics',
        totalChannels: 'Total Channels',
        totalChannelsDescription: 'Number of channels in your library',
        totalTags: 'Total Tags',
        totalTagsDescription: 'Filter tags for organizing channels',
        customDanbooruTags: 'Custom Danbooru Tags',
        customDanbooruTagsDescription: 'Custom tags added to autocomplete',
        confirmDeleteChannel: 'Are you sure you want to delete this channel?',
        confirmClearData: 'Are you sure you want to clear all data? This cannot be undone.',
        confirmDeleteTag: 'Are you sure you want to delete this tag?',
        enterNewTagName: 'Enter new tag name:',
        yes: 'Yes',
        no: 'No',
        copiedPrompt: 'Prompt copied to clipboard!',
        copiedFailed: 'Failed to copy prompt'
    },
    es: {
        name: 'Español',
        appTitle: 'Serpentnote',
        settings: 'Configuración',
        newChannel: 'Nuevo Canal',
        manageTags: 'Administrar Etiquetas',
        filterByTags: 'Filtrar por Etiquetas',
        allChannels: 'Todos los Canales',
        channels: 'Canales',
        gallery: 'Galería',
        uploadImage: 'Subir Imagen',
        noImages: '¡Aún no hay imágenes. Sube tu primera imagen generada por IA!',
        prompt: 'Prompt',
        copy: 'Copiar',
        edit: 'Editar',
        delete: 'Eliminar',
        cancel: 'Cancelar',
        save: 'Guardar',
        channelName: 'Nombre del Canal',
        tags: 'Etiquetas',
        addTag: 'Agregar etiqueta...',
        createNewTag: 'Crear Nueva Etiqueta',
        add: 'Agregar',
        theme: 'Tema',
        colorTheme: 'Tema de Color',
        themeDescription: 'Elige tu tema visual preferido',
        light: 'Claro',
        oledBlack: 'Negro OLED',
        language: 'Idioma',
        uiLanguage: 'Idioma de la Interfaz',
        languageDescription: 'Elige tu idioma de interfaz preferido',
        dataManagement: 'Gestión de Datos',
        exportData: 'Exportar Todos los Datos',
        exportDescription: 'Descarga todos los canales, prompts, etiquetas e imágenes como archivo JSON',
        exportBtn: 'Exportar Datos',
        importData: 'Importar Datos',
        importDescription: 'Sube un archivo JSON exportado previamente para restaurar tus datos',
        importBtn: 'Importar Datos',
        clearData: 'Borrar Todos los Datos',
        clearDescription: 'Eliminar permanentemente todos los canales, prompts, etiquetas e imágenes',
        clearBtn: 'Borrar Datos',
        statistics: 'Estadísticas',
        totalChannels: 'Total de Canales',
        totalChannelsDescription: 'Número de canales en tu biblioteca',
        totalTags: 'Total de Etiquetas',
        totalTagsDescription: 'Etiquetas de filtro para organizar canales',
        customDanbooruTags: 'Etiquetas Danbooru Personalizadas',
        customDanbooruTagsDescription: 'Etiquetas personalizadas agregadas al autocompletado',
        confirmDeleteChannel: '¿Estás seguro de que quieres eliminar este canal?',
        confirmClearData: '¿Estás seguro de que quieres borrar todos los datos? Esto no se puede deshacer.',
        confirmDeleteTag: '¿Estás seguro de que quieres eliminar esta etiqueta?',
        enterNewTagName: 'Ingrese el nuevo nombre de la etiqueta:',
        yes: 'Sí',
        no: 'No',
        copiedPrompt: '¡Prompt copiado al portapapeles!',
        copiedFailed: 'Error al copiar el prompt'
    },
    fr: {
        name: 'Français',
        appTitle: 'Serpentnote',
        settings: 'Paramètres',
        newChannel: 'Nouveau Canal',
        manageTags: 'Gérer les Étiquettes',
        filterByTags: 'Filtrer par Étiquettes',
        allChannels: 'Tous les Canaux',
        channels: 'Canaux',
        gallery: 'Galerie',
        uploadImage: 'Télécharger une Image',
        noImages: 'Pas encore d\'images. Téléchargez votre première image générée par IA!',
        prompt: 'Prompt',
        copy: 'Copier',
        edit: 'Modifier',
        delete: 'Supprimer',
        cancel: 'Annuler',
        save: 'Enregistrer',
        channelName: 'Nom du Canal',
        tags: 'Étiquettes',
        addTag: 'Ajouter une étiquette...',
        createNewTag: 'Créer une Nouvelle Étiquette',
        add: 'Ajouter',
        theme: 'Thème',
        colorTheme: 'Thème de Couleur',
        themeDescription: 'Choisissez votre thème visuel préféré',
        light: 'Clair',
        oledBlack: 'Noir OLED',
        language: 'Langue',
        uiLanguage: 'Langue de l\'Interface',
        languageDescription: 'Choisissez votre langue d\'interface préférée',
        dataManagement: 'Gestion des Données',
        exportData: 'Exporter Toutes les Données',
        exportDescription: 'Téléchargez tous les canaux, prompts, étiquettes et images en fichier JSON',
        exportBtn: 'Exporter les Données',
        importData: 'Importer des Données',
        importDescription: 'Téléchargez un fichier JSON précédemment exporté pour restaurer vos données',
        importBtn: 'Importer des Données',
        clearData: 'Effacer Toutes les Données',
        clearDescription: 'Supprimer définitivement tous les canaux, prompts, étiquettes et images',
        clearBtn: 'Effacer les Données',
        statistics: 'Statistiques',
        totalChannels: 'Total de Canaux',
        totalChannelsDescription: 'Nombre de canaux dans votre bibliothèque',
        totalTags: 'Total d\'Étiquettes',
        totalTagsDescription: 'Étiquettes de filtre pour organiser les canaux',
        customDanbooruTags: 'Étiquettes Danbooru Personnalisées',
        customDanbooruTagsDescription: 'Étiquettes personnalisées ajoutées à l\'autocomplétion',
        confirmDeleteChannel: 'Êtes-vous sûr de vouloir supprimer ce canal?',
        confirmClearData: 'Êtes-vous sûr de vouloir effacer toutes les données? Cette action ne peut pas être annulée.',
        confirmDeleteTag: 'Êtes-vous sûr de vouloir supprimer cette étiquette?',
        enterNewTagName: 'Entrez le nouveau nom de l\'étiquette:',
        yes: 'Oui',
        no: 'Non',
        copiedPrompt: 'Prompt copié dans le presse-papiers!',
        copiedFailed: 'Échec de la copie du prompt'
    },
    zh: {
        name: '中文',
        appTitle: 'Serpentnote',
        settings: '设置',
        newChannel: '新建频道',
        manageTags: '管理标签',
        filterByTags: '按标签筛选',
        allChannels: '所有频道',
        channels: '频道',
        gallery: '画廊',
        uploadImage: '上传图片',
        noImages: '还没有图片。上传您的第一张AI生成的图片！',
        prompt: '提示词',
        copy: '复制',
        edit: '编辑',
        delete: '删除',
        cancel: '取消',
        save: '保存',
        channelName: '频道名称',
        tags: '标签',
        addTag: '添加标签...',
        createNewTag: '创建新标签',
        add: '添加',
        theme: '主题',
        colorTheme: '颜色主题',
        themeDescription: '选择您喜欢的视觉主题',
        light: '亮色',
        oledBlack: 'OLED黑',
        language: '语言',
        uiLanguage: '界面语言',
        languageDescription: '选择您喜欢的界面语言',
        dataManagement: '数据管理',
        exportData: '导出所有数据',
        exportDescription: '将所有频道、提示词、标签和图片下载为JSON文件',
        exportBtn: '导出数据',
        importData: '导入数据',
        importDescription: '上传之前导出的JSON文件以恢复您的数据',
        importBtn: '导入数据',
        clearData: '清除所有数据',
        clearDescription: '永久删除所有频道、提示词、标签和图片',
        clearBtn: '清除数据',
        statistics: '统计',
        totalChannels: '总频道数',
        totalChannelsDescription: '您的库中的频道数量',
        totalTags: '总标签数',
        totalTagsDescription: '用于组织频道的筛选标签',
        customDanbooruTags: '自定义Danbooru标签',
        customDanbooruTagsDescription: '添加到自动完成的自定义标签',
        confirmDeleteChannel: '确定要删除此频道吗？',
        confirmClearData: '确定要清除所有数据吗？此操作无法撤消。',
        confirmDeleteTag: '确定要删除此标签吗？',
        enterNewTagName: '输入新标签名称：',
        yes: '是',
        no: '否',
        copiedPrompt: '提示词已复制到剪贴板！',
        copiedFailed: '复制提示词失败'
    },
    ja: {
        name: '日本語',
        appTitle: 'Serpentnote',
        settings: '設定',
        newChannel: '新しいチャンネル',
        manageTags: 'タグを管理',
        filterByTags: 'タグでフィルター',
        allChannels: 'すべてのチャンネル',
        channels: 'チャンネル',
        gallery: 'ギャラリー',
        uploadImage: '画像をアップロード',
        noImages: 'まだ画像がありません。最初のAI生成画像をアップロードしてください！',
        prompt: 'プロンプト',
        copy: 'コピー',
        edit: '編集',
        delete: '削除',
        cancel: 'キャンセル',
        save: '保存',
        channelName: 'チャンネル名',
        tags: 'タグ',
        addTag: 'タグを追加...',
        createNewTag: '新しいタグを作成',
        add: '追加',
        theme: 'テーマ',
        colorTheme: 'カラーテーマ',
        themeDescription: 'お好みのビジュアルテーマを選択',
        light: 'ライト',
        oledBlack: 'OLEDブラック',
        language: '言語',
        uiLanguage: 'インターフェース言語',
        languageDescription: 'お好みのインターフェース言語を選択',
        dataManagement: 'データ管理',
        exportData: 'すべてのデータをエクスポート',
        exportDescription: 'すべてのチャンネル、プロンプト、タグ、画像をJSONファイルとしてダウンロード',
        exportBtn: 'データをエクスポート',
        importData: 'データをインポート',
        importDescription: '以前にエクスポートしたJSONファイルをアップロードしてデータを復元',
        importBtn: 'データをインポート',
        clearData: 'すべてのデータをクリア',
        clearDescription: 'すべてのチャンネル、プロンプト、タグ、画像を完全に削除',
        clearBtn: 'データをクリア',
        statistics: '統計',
        totalChannels: '総チャンネル数',
        totalChannelsDescription: 'ライブラリ内のチャンネル数',
        totalTags: '総タグ数',
        totalTagsDescription: 'チャンネルを整理するためのフィルタータグ',
        customDanbooruTags: 'カスタムDanbooruタグ',
        customDanbooruTagsDescription: 'オートコンプリートに追加されたカスタムタグ',
        confirmDeleteChannel: 'このチャンネルを削除してもよろしいですか？',
        confirmClearData: 'すべてのデータをクリアしてもよろしいですか？この操作は元に戻せません。',
        confirmDeleteTag: 'このタグを削除してもよろしいですか？',
        enterNewTagName: '新しいタグ名を入力してください：',
        yes: 'はい',
        no: 'いいえ',
        copiedPrompt: 'プロンプトをクリップボードにコピーしました！',
        copiedFailed: 'プロンプトのコピーに失敗しました'
    },
    ar: {
        name: 'العربية',
        appTitle: 'Serpentnote',
        settings: 'الإعدادات',
        newChannel: 'قناة جديدة',
        manageTags: 'إدارة العلامات',
        filterByTags: 'تصفية حسب العلامات',
        allChannels: 'جميع القنوات',
        channels: 'القنوات',
        gallery: 'المعرض',
        uploadImage: 'تحميل صورة',
        noImages: 'لا توجد صور بعد. قم بتحميل أول صورة تم إنشاؤها بواسطة الذكاء الاصطناعي!',
        prompt: 'الموجه',
        copy: 'نسخ',
        edit: 'تعديل',
        delete: 'حذف',
        cancel: 'إلغاء',
        save: 'حفظ',
        channelName: 'اسم القناة',
        tags: 'العلامات',
        addTag: 'إضافة علامة...',
        createNewTag: 'إنشاء علامة جديدة',
        add: 'إضافة',
        theme: 'المظهر',
        colorTheme: 'نظام الألوان',
        themeDescription: 'اختر المظهر المرئي المفضل لديك',
        light: 'فاتح',
        oledBlack: 'أسود OLED',
        language: 'اللغة',
        uiLanguage: 'لغة الواجهة',
        languageDescription: 'اختر لغة الواجهة المفضلة لديك',
        dataManagement: 'إدارة البيانات',
        exportData: 'تصدير جميع البيانات',
        exportDescription: 'تنزيل جميع القنوات والموجهات والعلامات والصور كملف JSON',
        exportBtn: 'تصدير البيانات',
        importData: 'استيراد البيانات',
        importDescription: 'قم بتحميل ملف JSON تم تصديره مسبقًا لاستعادة بياناتك',
        importBtn: 'استيراد البيانات',
        clearData: 'مسح جميع البيانات',
        clearDescription: 'حذف جميع القنوات والموجهات والعلامات والصور بشكل دائم',
        clearBtn: 'مسح البيانات',
        statistics: 'الإحصائيات',
        totalChannels: 'إجمالي القنوات',
        totalChannelsDescription: 'عدد القنوات في مكتبتك',
        totalTags: 'إجمالي العلامات',
        totalTagsDescription: 'علامات الفلترة لتنظيم القنوات',
        customDanbooruTags: 'علامات Danbooru المخصصة',
        customDanbooruTagsDescription: 'علامات مخصصة مضافة إلى الإكمال التلقائي',
        confirmDeleteChannel: 'هل أنت متأكد أنك تريد حذف هذه القناة؟',
        confirmClearData: 'هل أنت متأكد أنك تريد مسح جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء.',
        confirmDeleteTag: 'هل أنت متأكد أنك تريد حذف هذه العلامة؟',
        enterNewTagName: 'أدخل اسم العلامة الجديدة:',
        yes: 'نعم',
        no: 'لا',
        copiedPrompt: 'تم نسخ الموجه إلى الحافظة!',
        copiedFailed: 'فشل نسخ الموجه'
    }
};

// Custom confirm dialog
let confirmResolve: ((value: boolean) => void) | null = null;

function t(key: string): string {
    const lang = state.language || 'en';
    return translations[lang]?.[key] || translations['en'][key] || key;
}

function updateUILanguage() {
    // Skip translation if English is selected (use original HTML text)
    if (state.language === 'en') {
        return;
    }

    // Update app title
    const appTitle = document.querySelector('.app-title');
    if (appTitle) appTitle.textContent = t('appTitle');

    // Update sidebar
    const filterByTagsTitle = document.querySelector('.sidebar-section-title');
    if (filterByTagsTitle) filterByTagsTitle.textContent = t('filterByTags');

    const allChannelsBtn = document.querySelector('[data-filter="all"]');
    if (allChannelsBtn) allChannelsBtn.textContent = t('allChannels');

    const channelsTitle = document.querySelectorAll('.sidebar-section-title')[1];
    if (channelsTitle) channelsTitle.textContent = t('channels');

    const newChannelBtn = document.getElementById('newChannelBtn');
    if (newChannelBtn) newChannelBtn.textContent = t('newChannel');

    // Update main content section titles
    const galleryTitle = document.querySelector('.gallery-section .section-header h3');
    if (galleryTitle) galleryTitle.textContent = t('gallery');

    const uploadBtn = document.getElementById('uploadImageBtn');
    if (uploadBtn) {
        const btnText = uploadBtn.childNodes[1];
        if (btnText) btnText.textContent = ' ' + t('uploadImage');
    }

    const promptTitle = document.querySelector('.prompt-section .section-header h3');
    if (promptTitle) promptTitle.textContent = t('prompt');

    // Update channel modal
    const channelModalTitle = document.querySelector('#channelModal .modal-header h2');
    if (channelModalTitle) channelModalTitle.textContent = t('newChannel');

    const channelNameLabel = document.querySelector('label[for="channelNameInput"]');
    if (channelNameLabel) channelNameLabel.textContent = t('channelName');

    const tagsLabel = document.querySelector('label[for="tagInput"]');
    if (tagsLabel) tagsLabel.textContent = t('tags');

    const tagInput = document.getElementById('tagInput') as HTMLInputElement;
    if (tagInput) tagInput.placeholder = t('addTag');

    const promptLabel = document.querySelector('label[for="promptInput"]');
    if (promptLabel) promptLabel.textContent = t('prompt');

    const cancelChannelBtn = document.getElementById('cancelChannelBtn');
    if (cancelChannelBtn) cancelChannelBtn.textContent = t('cancel');

    const saveChannelBtn = document.getElementById('saveChannelBtn');
    if (saveChannelBtn) saveChannelBtn.textContent = t('save');

    // Update tags modal
    const tagsModalTitle = document.querySelector('#tagsModal .modal-header h2');
    if (tagsModalTitle) tagsModalTitle.textContent = t('manageTags');

    const createTagLabel = document.querySelector('label[for="newTagInput"]');
    if (createTagLabel) createTagLabel.textContent = t('createNewTag');

    const addTagBtn = document.getElementById('addTagBtn');
    if (addTagBtn) addTagBtn.textContent = t('add');

    // Update settings modal
    const settingsTitle = document.querySelector('#settingsModal .modal-header h2');
    if (settingsTitle) settingsTitle.textContent = t('settings');

    const themeSection = document.querySelectorAll('.settings-section-title')[0];
    if (themeSection) themeSection.textContent = t('theme');

    const colorThemeLabel = document.querySelectorAll('.settings-item label')[0];
    if (colorThemeLabel) colorThemeLabel.textContent = t('colorTheme');

    const themeDesc = document.querySelectorAll('.settings-description')[0];
    if (themeDesc) themeDesc.textContent = t('themeDescription');

    const lightSpan = document.querySelector('[data-theme="light"] span');
    if (lightSpan) lightSpan.textContent = t('light');

    const oledBlackSpan = document.querySelector('[data-theme="oled-black"] span');
    if (oledBlackSpan) oledBlackSpan.textContent = t('oledBlack');

    const languageSection = document.querySelectorAll('.settings-section-title')[1];
    if (languageSection) languageSection.textContent = t('language');

    const uiLanguageLabel = document.querySelectorAll('.settings-item label')[1];
    if (uiLanguageLabel) uiLanguageLabel.textContent = t('uiLanguage');

    const languageDesc = document.querySelectorAll('.settings-description')[1];
    if (languageDesc) languageDesc.textContent = t('languageDescription');

    const customEmojiFontSection = document.querySelectorAll('.settings-section-title')[2];
    if (customEmojiFontSection) customEmojiFontSection.textContent = t('customEmojiFont');

    const uploadEmojiFontLabel = document.querySelectorAll('.settings-item label')[2];
    if (uploadEmojiFontLabel) uploadEmojiFontLabel.textContent = t('uploadEmojiFont');

    const uploadEmojiFontDesc = document.querySelectorAll('.settings-description')[2];
    if (uploadEmojiFontDesc) uploadEmojiFontDesc.textContent = t('uploadEmojiFontDescription');

    const dataManagementSection = document.querySelectorAll('.settings-section-title')[3];
    if (dataManagementSection) dataManagementSection.textContent = t('dataManagement');

    const exportDataLabel = document.querySelectorAll('.settings-item label')[3];
    if (exportDataLabel) exportDataLabel.textContent = t('exportData');

    const exportDesc = document.querySelectorAll('.settings-description')[3];
    if (exportDesc) exportDesc.textContent = t('exportDescription');

    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) exportBtn.textContent = t('exportBtn');

    const importDataLabel = document.querySelectorAll('.settings-item label')[4];
    if (importDataLabel) importDataLabel.textContent = t('importData');

    const importDesc = document.querySelectorAll('.settings-description')[4];
    if (importDesc) importDesc.textContent = t('importDescription');

    const importBtn = document.getElementById('importDataBtn');
    if (importBtn) importBtn.textContent = t('importBtn');

    const clearDataLabel = document.querySelectorAll('.settings-item label')[5];
    if (clearDataLabel) clearDataLabel.textContent = t('clearData');

    const clearDesc = document.querySelectorAll('.settings-description')[5];
    if (clearDesc) clearDesc.textContent = t('clearDescription');

    const clearBtn = document.getElementById('clearDataBtn');
    if (clearBtn) clearBtn.textContent = t('clearBtn');

    const statisticsSection = document.querySelectorAll('.settings-section-title')[4];
    if (statisticsSection) statisticsSection.textContent = t('statistics');

    const totalChannelsLabel = document.querySelectorAll('.settings-item label')[6];
    if (totalChannelsLabel) totalChannelsLabel.textContent = t('totalChannels');

    const totalChannelsDesc = document.querySelectorAll('.settings-description')[6];
    if (totalChannelsDesc) totalChannelsDesc.textContent = t('totalChannelsDescription');

    const totalTagsLabel = document.querySelectorAll('.settings-item label')[7];
    if (totalTagsLabel) totalTagsLabel.textContent = t('totalTags');

    const totalTagsDesc = document.querySelectorAll('.settings-description')[7];
    if (totalTagsDesc) totalTagsDesc.textContent = t('totalTagsDescription');

    const customDanbooruLabel = document.querySelectorAll('.settings-item label')[8];
    if (customDanbooruLabel) customDanbooruLabel.textContent = t('customDanbooruTags');

    const customDanbooruDesc = document.querySelectorAll('.settings-description')[8];
    if (customDanbooruDesc) customDanbooruDesc.textContent = t('customDanbooruTagsDescription');


    // Update confirm modal
    const confirmYes = document.getElementById('confirmYes');
    if (confirmYes) confirmYes.textContent = t('yes');

    const confirmNo = document.getElementById('confirmNo');
    if (confirmNo) confirmNo.textContent = t('no');

    // Update empty state if visible
    const galleryEmpty = document.querySelector('.gallery-empty p');
    if (galleryEmpty) galleryEmpty.textContent = t('noImages');
}

function customConfirm(message: string, okText: string = 'Delete', cancelText: string = 'Cancel'): Promise<boolean> {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        const modal = document.getElementById('confirmModal')!;
        const messageEl = document.getElementById('confirmMessage')!;
        const okBtn = document.getElementById('confirmOkBtn') as HTMLButtonElement;
        const cancelBtn = document.getElementById('confirmCancelBtn') as HTMLButtonElement;

        messageEl.textContent = message;
        if (okBtn) okBtn.textContent = okText;
        if (cancelBtn) cancelBtn.textContent = cancelText;
        modal.classList.add('active');
    });
}

function closeConfirmModal(result: boolean) {
    const modal = document.getElementById('confirmModal')!;
    modal.classList.remove('active');
    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

// Custom prompt dialog
let promptResolve: ((value: string | null) => void) | null = null;

function customPrompt(message: string, defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
        promptResolve = resolve;
        const modal = document.getElementById('promptModal')!;
        const messageEl = document.getElementById('promptMessage')!;
        const inputEl = document.getElementById('promptInput') as HTMLInputElement;

        messageEl.textContent = message;
        inputEl.value = defaultValue;
        modal.classList.add('active');

        // Focus and select the input
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 100);
    });
}

function closePromptModal(result: string | null) {
    const modal = document.getElementById('promptModal')!;
    modal.classList.remove('active');
    if (promptResolve) {
        promptResolve(result);
        promptResolve = null;
    }
}

// Helper function to return text (native emoji support)
function convertToTwemoji(text: string): string {
    // Just return plain text - browser will render native emojis
    return text;
}

// Initialize app
async function init() {
    const startTime = Date.now();
    const minLoadingTime = 2000; // Minimum 2000ms (2 seconds) loading screen display

    try {
        log('🚀 Application Starting...');

        // Initialize storage based on environment
        if (isElectron) {
            await initElectronStorage();
        } else {
            // Initialize IndexedDB for browser mode
            try {
                await initIndexedDB();
            } catch (error) {
                // Fallback to localStorage if IndexedDB fails
            }
        }

        await loadFromStorage();
        log('✅ Storage loaded:', {
            channels: state.channels.length,
            tags: state.tags.length,
            customDanbooruTags: customDanbooruTags.length,
            theme: state.theme,
            language: state.language
        });

        // Initialize tag search worker AFTER loading custom tags from storage
        initTagWorker();
        log('✅ Tag worker initialized');

        applyTheme(state.theme);
        log('✅ Theme applied:', state.theme);

        applyLanguage(state.language);
        log('✅ Language applied:', state.language);

        await loadCustomEmojiFont();
        log('✅ Custom emoji font loaded');

        renderChannelsList();
        log('✅ Channels list rendered');

        renderFilterTags();
        log('✅ Filter tags rendered');

        setupEventListeners();
        log('✅ Event listeners setup complete');

        if (state.channels.length === 0) {
            showEmptyState();
            log('✅ Empty state shown');
        } else {
            // Select first channel
            selectChannel(state.channels[0].id);
            log('✅ First channel selected:', state.channels[0].name);
        }

        log('🎉 Application initialization complete!');

        // Ensure loading screen shows for minimum time
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

        setTimeout(() => {
            hideInitialLoadingScreen();
        }, remainingTime);

        // Debug title font after initialization
        setTimeout(() => {
            const titleElement = document.querySelector('.top-bar-title');
            if (titleElement) {
                const computedStyle = window.getComputedStyle(titleElement);
                log('🎯 POST-INIT Title Check:');
                log('📝 Title computed font-family:', computedStyle.fontFamily);
            }
        }, 100);
    } catch (error) {
        error('❌ Application initialization failed:', error);
        error('Error stack:', error.stack);
        // Hide loading screen even if initialization fails (with minimum time)
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
        setTimeout(() => {
            hideInitialLoadingScreen();
        }, remainingTime);
    }
}

// Local storage functions
async function saveToStorage() {
    try {
        showSaveIndicator('saving');
        await storageSet(STORAGE_KEYS.CHANNELS, JSON.stringify(state.channels));
        await storageSet(STORAGE_KEYS.TAGS, JSON.stringify(state.tags));
        await storageSet(STORAGE_KEYS.THEME, state.theme);
        await storageSet(STORAGE_KEYS.LANGUAGE, state.language);
        await storageSet(STORAGE_KEYS.DANBOORU_TAGS, JSON.stringify(customDanbooruTags));
        showSaveIndicator('saved');

        // Check storage quota and warn if needed (only for browser)
        if (!isElectron) {
            const quota = checkStorageQuota();
            showStorageWarning(quota.percentage);
        }
    } catch (e) {
        showSaveIndicator('error');
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
            alert('Storage quota exceeded! Your images could not be saved. Please export your data and clear some images to free up space.');
            error('LocalStorage quota exceeded:', e);
        } else {
            error('Error saving to storage:', e);
        }
    }
}

// Throttled save - limits saves to once per second max
const throttledSave = throttle(saveToStorage, 1000);

// Save indicator
let saveIndicatorTimeout: number | null = null;

function showSaveIndicator(status: 'saving' | 'saved' | 'error') {
    const indicator = document.getElementById('saveIndicator');
    if (!indicator) return;

    // Clear existing timeout
    if (saveIndicatorTimeout !== null) {
        clearTimeout(saveIndicatorTimeout);
    }

    indicator.className = 'save-indicator show';
    const span = indicator.querySelector('span');

    if (status === 'saving') {
        indicator.classList.add('saving');
        if (span) span.textContent = 'Saving...';
    } else if (status === 'saved') {
        indicator.classList.remove('saving');
        if (span) span.textContent = 'Saved';

        // Hide after 2 seconds
        saveIndicatorTimeout = window.setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    } else if (status === 'error') {
        indicator.classList.remove('saving');
        indicator.style.background = 'rgba(255, 59, 48, 0.15)';
        indicator.style.borderColor = 'rgba(255, 59, 48, 0.3)';
        indicator.style.color = '#ff3b30';
        if (span) span.textContent = 'Error';

        // Hide after 3 seconds
        saveIndicatorTimeout = window.setTimeout(() => {
            indicator.classList.remove('show');
            // Reset styles
            indicator.style.background = '';
            indicator.style.borderColor = '';
            indicator.style.color = '';
        }, 3000);
    }
}

// Loading overlay utilities
function showLoadingOverlay(text: string = 'Processing...') {
    const overlay = document.getElementById('loadingOverlay');
    const textElement = overlay?.querySelector('.loading-text');
    if (overlay) {
        overlay.classList.add('show');
        if (textElement) {
            textElement.textContent = text;
        }
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

// Initial loading screen utilities
function hideInitialLoadingScreen() {
    const loadingScreen = document.getElementById('initialLoadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        // Remove from DOM after animation completes (1s animation + buffer)
        setTimeout(() => {
            loadingScreen.remove();
        }, 1100);
    }
}

// User-friendly error notification system
function showErrorNotification(message: string, duration: number = 5000) {
    // Create error notification element
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${message}</span>
        <button class="error-notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Auto-remove after duration
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

function showSuccessNotification(message: string, duration: number = 3000) {
    // Create success notification element
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${message}</span>
        <button class="success-notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Auto-remove after duration
    setTimeout(() => {
        notification.classList.remove('show');
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
                error('Failed to parse channels data:', e);
                showErrorNotification('Failed to load channels. Data may be corrupted.');
                state.channels = [];
            }
        }

        if (tagsData) {
            try {
                state.tags = JSON.parse(tagsData);
            } catch (e) {
                error('Failed to parse tags data:', e);
                showErrorNotification('Failed to load tags. Data may be corrupted.');
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
                error('Failed to parse Danbooru tags data:', e);
                customDanbooruTags = [];
            }
        }
    } catch (e) {
        error('Critical error loading from storage:', e);
        showErrorNotification('Failed to load application data. Please refresh the page.');
    }
}

// Utility function to setup modal backdrop close
function setupModalBackdropClose(modalId: string, closeCallback: () => void) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                closeCallback();
            }
        });
    }
}

// Event listeners
function setupEventListeners() {
    // Hamburger menu
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const hamburgerDropdown = document.getElementById('hamburgerDropdown');

    hamburgerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburgerDropdown?.classList.toggle('active');
    });

    // Close hamburger menu when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!hamburgerDropdown?.contains(target) && target !== hamburgerBtn) {
            hamburgerDropdown?.classList.remove('active');
        }
    });

    // Hamburger settings button
    document.getElementById('hamburgerSettingsBtn')?.addEventListener('click', () => {
        hamburgerDropdown?.classList.remove('active');
        openSettingsModal();
    });

    // Hamburger Channel Tag Manager button
    document.getElementById('hamburgerChannelTagBtn')?.addEventListener('click', () => {
        hamburgerDropdown?.classList.remove('active');
        openTagsModal();
    });

    // Hamburger Danbooru Tag Manager button
    document.getElementById('hamburgerDanbooruBtn')?.addEventListener('click', () => {
        hamburgerDropdown?.classList.remove('active');
        openDanbooruTagManagerModal();
    });

    // Hamburger Gallery button
    document.getElementById('hamburgerGalleryBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();

        // Check if there are any images across all channels
        const totalImages = state.channels.reduce((count, channel) => count + channel.images.length, 0);

        console.log('🖼️ Gallery button clicked');
        console.log('📊 Total channels:', state.channels.length);
        console.log('📸 Total images:', totalImages);

        if (totalImages === 0) {
            console.log('⚠️ No images found - preventing gallery from opening');
            // Don't close the menu yet - let the shake animation play first
            const galleryBtn = document.getElementById('hamburgerGalleryBtn');
            console.log('🎯 Gallery button found:', galleryBtn);
            if (galleryBtn) {
                console.log('➕ Adding shake animation via inline style');

                // Apply animation directly via inline style to bypass CSS cache
                galleryBtn.style.animation = 'shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';

                // Verify animation was applied
                setTimeout(() => {
                    const computedStyle = window.getComputedStyle(galleryBtn);
                    console.log('🎨 Animation property after setting:', computedStyle.animation);
                }, 10);

                // Close menu after shake animation completes
                setTimeout(() => {
                    galleryBtn.style.animation = '';
                    hamburgerDropdown?.classList.remove('active');
                    console.log('➖ Removed shake animation and closed menu');
                }, 500);
            } else {
                console.log('❌ Gallery button not found!');
                // If button not found, close menu immediately
                hamburgerDropdown?.classList.remove('active');
            }
            showErrorNotification('No images in gallery yet. Upload some images first!');
            console.log('🛑 Returning early - gallery modal will NOT open');
            return;
        }

        // Close menu before opening modal (only when there are images)
        hamburgerDropdown?.classList.remove('active');
        console.log('✅ Images found - opening gallery modal');
        openGalleryModal();
    });

    // New channel button
    document.getElementById('newChannelBtn')?.addEventListener('click', () => {
        openChannelModal();
    });

    // Channel modal buttons
    document.getElementById('closeChannelModal')?.addEventListener('click', closeChannelModal);
    document.getElementById('cancelChannelBtn')?.addEventListener('click', closeChannelModal);
    document.getElementById('saveChannelBtn')?.addEventListener('click', saveChannel);

    // Variant management buttons
    document.getElementById('addPromptVariantBtn')?.addEventListener('click', addPromptVariant);
    document.getElementById('addNegativePromptVariantBtn')?.addEventListener('click', addNegativePromptVariant);

    // Tags modal buttons
    document.getElementById('closeTagsModal')?.addEventListener('click', closeTagsModal);
    document.getElementById('addTagBtn')?.addEventListener('click', addNewTag);

    // Settings modal buttons
    document.getElementById('closeSettingsModal')?.addEventListener('click', closeSettingsModal);
    document.getElementById('closeGalleryModal')?.addEventListener('click', closeGalleryModal);
    document.getElementById('closeDanbooruTagManagerModal')?.addEventListener('click', closeDanbooruTagManagerModal);
    document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
    document.getElementById('importDataBtn')?.addEventListener('click', () => {
        document.getElementById('importFileInput')?.click();
    });
    document.getElementById('clearDataBtn')?.addEventListener('click', clearAllData);
    document.getElementById('importFileInput')?.addEventListener('change', importData);

    // Custom emoji font upload
    document.getElementById('uploadEmojiFontBtn')?.addEventListener('click', () => {
        document.getElementById('emojiFileInput')?.click();
    });
    document.getElementById('emojiFileInput')?.addEventListener('change', handleEmojiFontUpload);
    document.getElementById('resetEmojiFontBtn')?.addEventListener('click', resetEmojiFont);

    // Emoji variant context menu
    document.addEventListener('contextmenu', (e) => {
        const target = e.target as HTMLElement;

        // Check if right-clicking on an input or textarea
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            log('🖱️ Right-click on text field');

            // Get the position where the user clicked
            const clickX = e.clientX;
            const clickY = e.clientY;
            log('📍 Click position:', clickX, clickY);

            // Try to determine which character position was clicked
            // For input fields, we'll scan through each position to find the closest
            const text = target.value;
            let closestPos = 0;
            let closestDistance = Infinity;

            // Check each character position
            for (let i = 0; i <= text.length; i++) {
                const coords = getCaretCoordinates(target, i);
                const distance = Math.sqrt(
                    Math.pow(coords.x - clickX, 2) +
                    Math.pow(coords.y - clickY, 2)
                );

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPos = i;
                }
            }

            log('📍 Closest character position:', closestPos);
            log('📝 Text:', text);

            // Get emoji at clicked position
            const emoji = getEmojiAtPosition(text, closestPos);

            log('😀 Emoji found:', emoji);

            if (emoji) {
                e.preventDefault();

                // Get the actual position of the emoji character
                log('📏 Getting emoji coordinates...');
                const coords = getCaretCoordinates(target, closestPos);
                log('📍 Emoji coords:', coords);

                // Show menu at the emoji position
                showEmojiVariantMenu(emoji, coords.x, coords.y, target);
            } else {
                log('❌ No emoji found at clicked position');
            }
        }
    });

    // 'V' key to open emoji variant menu (Ctrl+Shift+V or Alt+V)
    document.addEventListener('keydown', (e) => {
        // Check for Ctrl+Shift+V or Alt+V
        if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey && e.shiftKey || e.altKey)) {
            const target = e.target as HTMLElement;

            // Check if focused on an input or textarea
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                const cursorPos = target.selectionStart || 0;
                const text = target.value;

                // Get emoji at cursor position
                const emoji = getEmojiAtPosition(text, cursorPos);

                if (emoji) {
                    e.preventDefault();
                    // Get cursor position on screen
                    const rect = target.getBoundingClientRect();
                    const x = rect.left + 20;
                    const y = rect.top + 40;
                    showEmojiVariantMenu(emoji, x, y, target);
                }
            }
        }
    });

    // Hide emoji variant menu on click outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('emojiVariantMenu');
        if (menu && emojiVariantMenuActive && !menu.contains(e.target as Node)) {
            hideEmojiVariantMenu();
        }
    });

    // Hide emoji variant menu on right-click outside
    document.addEventListener('contextmenu', (e) => {
        const menu = document.getElementById('emojiVariantMenu');
        if (menu && emojiVariantMenuActive && !menu.contains(e.target as Node)) {
            hideEmojiVariantMenu();
        }
    });

    // Click on backdrop closes only variant menu
    const emojiVariantBackdrop = document.getElementById('emojiVariantBackdrop');
    if (emojiVariantBackdrop) {
        emojiVariantBackdrop.addEventListener('click', (e) => {
            e.stopPropagation();
            hideEmojiVariantMenu();
        });

        emojiVariantBackdrop.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideEmojiVariantMenu();
        });
    }

    // Theme selection
    document.querySelectorAll('.theme-option').forEach(button => {
        button.addEventListener('click', () => {
            const theme = button.getAttribute('data-theme');
            if (theme) {
                // Check if clicking on already active theme
                if (state.theme === theme) {
                    shakeElement(button as HTMLElement);
                } else {
                    selectTheme(theme);
                }
            }
        });
    });

    // Language dropdown
    const languageDropdownBtn = document.getElementById('languageDropdownBtn');
    const languageDropdown = document.getElementById('languageDropdown');

    languageDropdownBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        languageDropdownBtn.classList.toggle('open');
        languageDropdown?.classList.toggle('show');
    });

    // Close language dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!languageDropdown?.contains(target) && target !== languageDropdownBtn) {
            languageDropdownBtn?.classList.remove('open');
            languageDropdown?.classList.remove('show');
        }
    });

    // Language selection
    document.querySelectorAll('.language-option').forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.getAttribute('data-lang');
            if (lang) {
                // Check if clicking on already active language
                if (state.language === lang) {
                    shakeElement(button as HTMLElement);
                } else {
                    selectLanguage(lang);
                    languageDropdownBtn?.classList.remove('open');
                    languageDropdown?.classList.remove('show');
                }
            }
        });
    });

    // Tag input (Enter key)
    document.getElementById('tagInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTagToChannel();
        }
    });

    // New tag input (Enter key)
    document.getElementById('newTagInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewTag();
        }
    });

    // Emoji picker
    const emojiPickerBtn = document.getElementById('emojiPickerBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    let selectedEmojiIndex = -1;

    emojiPickerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = emojiPicker!.style.display === 'block';

        if (isVisible) {
            emojiPicker!.style.display = 'none';
            selectedEmojiIndex = -1;
        } else {
            // Position the emoji picker below the button
            const rect = emojiPickerBtn.getBoundingClientRect();
            emojiPicker!.style.top = `${rect.bottom + 8}px`;
            emojiPicker!.style.left = `${rect.left}px`;
            emojiPicker!.style.display = 'block';
            selectedEmojiIndex = -1;
        }
    });

    // Keyboard navigation for emoji picker
    document.addEventListener('keydown', (e) => {
        if (emojiPicker && emojiPicker.style.display === 'block') {
            const activeGrid = Array.from(document.querySelectorAll('.emoji-grid')).find(
                grid => (grid as HTMLElement).style.display === 'grid'
            ) as HTMLElement;

            if (!activeGrid) return;

            const emojiOptions = Array.from(activeGrid.querySelectorAll('.emoji-option'));
            const gridColumns = 6; // Match CSS grid-template-columns

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                selectedEmojiIndex = Math.min(selectedEmojiIndex + 1, emojiOptions.length - 1);
                highlightEmoji(emojiOptions, selectedEmojiIndex);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                selectedEmojiIndex = Math.max(selectedEmojiIndex - 1, 0);
                highlightEmoji(emojiOptions, selectedEmojiIndex);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedEmojiIndex = Math.min(selectedEmojiIndex + gridColumns, emojiOptions.length - 1);
                highlightEmoji(emojiOptions, selectedEmojiIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedEmojiIndex = Math.max(selectedEmojiIndex - gridColumns, 0);
                highlightEmoji(emojiOptions, selectedEmojiIndex);
            } else if (e.key === 'Enter' && selectedEmojiIndex >= 0) {
                e.preventDefault();
                (emojiOptions[selectedEmojiIndex] as HTMLElement).click();
            } else if (e.key === 'Escape') {
                emojiPicker.style.display = 'none';
                selectedEmojiIndex = -1;
            }
        }
    });

    function highlightEmoji(options: Element[], index: number) {
        options.forEach((opt, i) => {
            if (i === index) {
                opt.classList.add('emoji-highlighted');
                opt.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                opt.classList.remove('emoji-highlighted');
            }
        });
    }

    // Emoji category switching
    document.querySelectorAll('.emoji-category-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = (tab as HTMLElement).dataset.category;

            // Update active tab
            document.querySelectorAll('.emoji-category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding emoji grid
            document.querySelectorAll('.emoji-grid').forEach(grid => {
                const gridCategory = (grid as HTMLElement).dataset.category;
                if (gridCategory === category) {
                    (grid as HTMLElement).style.display = 'grid';
                } else {
                    (grid as HTMLElement).style.display = 'none';
                }
            });
        });
    });

    // Close emoji picker when clicking outside (but not if variant menu is open)
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const variantMenu = document.getElementById('emojiVariantMenu');
        const backdrop = document.getElementById('emojiVariantBackdrop');

        // Don't close emoji picker if clicking on variant menu or backdrop
        if (variantMenu?.contains(target) || target === backdrop) {
            return;
        }

        if (!emojiPicker?.contains(target) && target !== emojiPickerBtn && !emojiVariantMenuActive) {
            emojiPicker!.style.display = 'none';
        }
    });

    // Hide tag autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const autocomplete = document.getElementById('tagAutocomplete');
        const promptInput = document.getElementById('channelPromptInput');
        if (autocomplete && !autocomplete.contains(target) && target !== promptInput) {
            autocomplete.style.display = 'none';
            autocompleteSelectedIndex = -1;
        }
    });

    // Emoji selection
    document.querySelectorAll('.emoji-option').forEach(option => {
        // Left-click: Insert emoji
        option.addEventListener('click', (e) => {
            const emoji = option.getAttribute('data-emoji');
            const input = document.getElementById('newTagInput') as HTMLInputElement;
            if (emoji && input) {
                // Add emoji to the beginning of the input
                input.value = emoji + ' ' + input.value;
                input.focus();
                emojiPicker!.style.display = 'none';
            }
        });

        // Right-click: Show variants if available
        option.addEventListener('contextmenu', (e) => {
            log('🖱️ Right-click detected on emoji picker option');
            e.preventDefault();
            e.stopPropagation();

            const emoji = option.getAttribute('data-emoji');
            log('📝 Emoji from data-emoji attribute:', emoji);

            if (!emoji) {
                log('❌ No emoji attribute found');
                return;
            }

            // Check if this emoji has variants
            log('🔍 Checking if emoji has variants...');
            log('🔍 emojiVariants object exists?', typeof emojiVariants);
            log('🔍 Has variants for this emoji?', !!emojiVariants[emoji]);
            log('🔍 Variants:', emojiVariants[emoji]);

            if (emojiVariants[emoji]) {
                log('✅ Emoji has variants! Showing menu...');

                // Get the emoji button's position
                const buttonRect = (option as HTMLElement).getBoundingClientRect();
                log('📍 Emoji button rect:', buttonRect);

                // Create custom handler for variant selection in emoji picker
                const variantHandler = (selectedVariant: string) => {
                    log('🎯 Variant selected:', selectedVariant);
                    const input = document.getElementById('newTagInput') as HTMLInputElement;
                    if (input) {
                        input.value = selectedVariant + ' ' + input.value;
                        input.focus();
                        emojiPicker!.style.display = 'none';
                    }
                    hideEmojiVariantMenu();
                };

                log('📍 Showing variant menu directly under emoji button');
                showEmojiVariantMenuUnderElement(emoji, option as HTMLElement, variantHandler);
            } else {
                log('ℹ️ No variants available for this emoji');
                // Shake the emoji button to indicate no variants
                shakeElement(option as HTMLElement);
            }
        });
    });

    // Search input - declared early for "/" key shortcut
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    // Auto-focus search on "/" key (like GitHub)
    document.addEventListener('keydown', (e) => {
        // Only trigger if not in input/textarea and "/" is pressed
        const target = e.target as HTMLElement;
        const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

        if (!isInputFocused && e.key === '/' && searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

    // Debounced search to improve performance
    const debouncedSearch = debounce(() => {
        renderChannelsList();
    }, 300); // 300ms delay

    searchInput?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        state.searchQuery = value;

        // Show/hide clear button immediately
        if (clearSearchBtn) {
            clearSearchBtn.style.display = value ? 'flex' : 'none';
        }

        // Debounce the actual search/render
        debouncedSearch();
    });

    clearSearchBtn?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
            state.searchQuery = '';
            clearSearchBtn.style.display = 'none';
            searchInput.focus();
            renderChannelsList();
        }
    });

    // Search input Enter key - shake if empty or no results
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const value = searchInput.value.trim();
            if (!value) {
                shakeElement(searchInput);
                return;
            }

            // Check if search has any results
            const query = value.toLowerCase();
            let filteredChannels = state.channels;

            // Apply active tag filters first
            if (state.activeFilters.length > 0) {
                filteredChannels = filteredChannels.filter(c =>
                    state.activeFilters.every(tag => c.tags.includes(tag))
                );
            }

            // Apply search query
            filteredChannels = filteredChannels.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.prompt.toLowerCase().includes(query) ||
                c.tags.some(tag => tag.toLowerCase().includes(query))
            );

            // Shake if no results found
            if (filteredChannels.length === 0) {
                shakeElement(searchInput);
            }
        }
    });

    // Double-click gallery grid to upload images
    const galleryGridForUpload = document.getElementById('galleryGrid');
    if (galleryGridForUpload) {
        galleryGridForUpload.addEventListener('dblclick', (e) => {
            // Only trigger upload if not clicking on an image or its container
            const target = e.target as HTMLElement;
            if (!target.closest('.gallery-item')) {
                e.preventDefault();
                document.getElementById('fileInput')?.click();
            }
        });

        // Prevent text selection on double-click
        galleryGridForUpload.addEventListener('mousedown', (e) => {
            if (e.detail > 1) {
                e.preventDefault();
            }
        });

        // EVENT DELEGATION: Handle all gallery item clicks
        galleryGridForUpload.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Handle delete button clicks
            const deleteBtn = target.closest('.btn-delete-gallery-image');
            if (deleteBtn) {
                e.stopPropagation();
                const index = parseInt(deleteBtn.getAttribute('data-index') || '0');
                if (state.activeChannelId) {
                    const channel = state.channels.find(c => c.id === state.activeChannelId);
                    if (channel) {
                        deleteImageFromGallery(channel, index);
                    }
                }
                return;
            }

            // Handle gallery item clicks (open image or multi-select)
            const galleryItem = target.closest('.gallery-item');
            if (galleryItem && state.activeChannelId) {
                const channel = state.channels.find(c => c.id === state.activeChannelId);
                if (!channel) return;

                const mouseEvent = e as MouseEvent;

                // Check if Ctrl/Cmd key is pressed for multi-select
                if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
                    const imageUrl = galleryItem.getAttribute('data-image-url') || '';
                    toggleImageSelection(imageUrl, galleryItem as HTMLElement);
                } else {
                    const index = parseInt(galleryItem.getAttribute('data-index') || '0');
                    openImageModal(channel.images[index], index);
                }
            }
        });

        // KEYBOARD NAVIGATION: Handle gallery keyboard events
        galleryGridForUpload.addEventListener('keydown', (e) => {
            const target = e.target as HTMLElement;

            // Handle Enter or Space on gallery items
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();

                // Handle delete button
                const deleteBtn = target.closest('.btn-delete-gallery-image');
                if (deleteBtn) {
                    const index = parseInt(deleteBtn.getAttribute('data-index') || '0');
                    if (state.activeChannelId) {
                        const channel = state.channels.find(c => c.id === state.activeChannelId);
                        if (channel) {
                            deleteImageFromGallery(channel, index);
                        }
                    }
                    return;
                }

                // Handle gallery item
                const galleryItem = target.closest('.gallery-item');
                if (galleryItem && state.activeChannelId) {
                    const channel = state.channels.find(c => c.id === state.activeChannelId);
                    if (!channel) return;

                    // Check if Ctrl/Cmd key is pressed for multi-select
                    if (e.ctrlKey || e.metaKey) {
                        const imageUrl = galleryItem.getAttribute('data-image-url') || '';
                        toggleImageSelection(imageUrl, galleryItem as HTMLElement);
                    } else {
                        const index = parseInt(galleryItem.getAttribute('data-index') || '0');
                        openImageModal(channel.images[index], index);
                    }
                }
            }

            // Arrow key navigation in gallery
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                const galleryItem = target.closest('.gallery-item');
                if (!galleryItem) return;

                const allItems = Array.from(galleryGridForUpload.querySelectorAll('.gallery-item'));
                const currentIndex = allItems.indexOf(galleryItem as Element);

                if (currentIndex === -1) return;

                let nextIndex = currentIndex;
                const itemsPerRow = Math.floor(galleryGridForUpload.offsetWidth / 180); // Approximate items per row

                switch (e.key) {
                    case 'ArrowLeft':
                        nextIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
                        break;
                    case 'ArrowRight':
                        nextIndex = currentIndex < allItems.length - 1 ? currentIndex + 1 : currentIndex;
                        break;
                    case 'ArrowUp':
                        nextIndex = currentIndex - itemsPerRow;
                        if (nextIndex < 0) nextIndex = currentIndex;
                        break;
                    case 'ArrowDown':
                        nextIndex = currentIndex + itemsPerRow;
                        if (nextIndex >= allItems.length) nextIndex = currentIndex;
                        break;
                }

                if (nextIndex !== currentIndex) {
                    e.preventDefault();
                    const nextItem = allItems[nextIndex] as HTMLElement;
                    nextItem.focus();
                }
            }
        });
    }

    // Compare images button
    document.getElementById('compareImagesBtn')?.addEventListener('click', openComparisonModal);

    // Close comparison modal
    document.getElementById('closeComparisonModal')?.addEventListener('click', closeComparisonModal);

    // Clear comparison selection
    document.getElementById('clearComparisonBtn')?.addEventListener('click', clearComparisonSelection);

    // Close comparison modal when clicking outside
    setupModalBackdropClose('comparisonModal', closeComparisonModal);

    // Danbooru tag management
    document.getElementById('addDanbooruTagBtn')?.addEventListener('click', addDanbooruTag);
    document.getElementById('bulkImportBtn')?.addEventListener('click', bulkImportDanbooruTags);

    // Danbooru search bar
    const danbooruSearchInput = document.getElementById('danbooruSearchInput') as HTMLInputElement;
    const clearDanbooruSearchBtn = document.getElementById('clearDanbooruSearchBtn');

    danbooruSearchInput?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        danbooruSearchQuery = value;

        // Show/hide clear button
        if (clearDanbooruSearchBtn) {
            clearDanbooruSearchBtn.style.display = value ? 'flex' : 'none';
        }

        // Reset to first page when searching
        danbooruTagsPage = 0;

        // Re-render tags with filter
        renderDanbooruTags();
    });

    clearDanbooruSearchBtn?.addEventListener('click', () => {
        if (danbooruSearchInput) {
            danbooruSearchInput.value = '';
            danbooruSearchQuery = '';
            clearDanbooruSearchBtn.style.display = 'none';
            danbooruSearchInput.focus();
            danbooruTagsPage = 0;
            renderDanbooruTags();
        }
    });

    danbooruSearchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const value = danbooruSearchInput.value.trim();

            // Shake if empty
            if (!value) {
                shakeElement(danbooruSearchInput);
                return;
            }

            // Shake if no results
            const query = value.toLowerCase();
            const hasResults = customDanbooruTags.some(tag =>
                tag.name.toLowerCase().includes(query)
            );

            if (!hasResults) {
                shakeElement(danbooruSearchInput);
            }
        }
    });

    // Danbooru category selector - shake if selecting same value
    const danbooruCategorySelect = document.getElementById('danbooruCategorySelect') as HTMLSelectElement;
    if (danbooruCategorySelect) {
        let previousCategory = danbooruCategorySelect.value;

        danbooruCategorySelect.addEventListener('mousedown', () => {
            // Store the value before the dropdown opens
            previousCategory = danbooruCategorySelect.value;
        });

        danbooruCategorySelect.addEventListener('change', () => {
            // Check if the selected value is the same as before
            if (danbooruCategorySelect.value === previousCategory) {
                shakeElement(danbooruCategorySelect);
            }
            // Update previous value
            previousCategory = danbooruCategorySelect.value;
        });
    }

    // Tag pagination
    document.getElementById('prevTagPage')?.addEventListener('click', () => {
        if (state.currentTagPage > 0) {
            state.currentTagPage--;
            renderFilterTags();
        }
    });

    document.getElementById('nextTagPage')?.addEventListener('click', () => {
        const totalPages = Math.ceil(state.tags.length / state.tagsPerPage);
        if (state.currentTagPage < totalPages - 1) {
            state.currentTagPage++;
            renderFilterTags();
        }
    });

    // Clear filters button
    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
        state.activeFilter = 'all';
        state.activeFilters = [];
        renderFilterTags();
        renderChannelsList();
    });

    // Allow Enter key to add Danbooru tag
    document.getElementById('newDanbooruTagInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addDanbooruTag();
        }
    });

    // File input change
    document.getElementById('fileInput')?.addEventListener('change', handleFileUpload);

    // Drag & Drop image upload
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            galleryGrid.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e: Event) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Highlight drop zone when dragging over it
        ['dragenter', 'dragover'].forEach(eventName => {
            galleryGrid.addEventListener(eventName, () => {
                galleryGrid.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            galleryGrid.addEventListener(eventName, () => {
                galleryGrid.classList.remove('drag-over');
            }, false);
        });

        // Handle dropped files
        galleryGrid.addEventListener('drop', (e: DragEvent) => {
            const dt = e.dataTransfer;

            // Check if this is an internal drag (image reordering)
            // Internal drags have effectAllowed set to 'move'
            if (dt?.effectAllowed === 'move') {
                // This is an image reorder, not a file upload - ignore it
                return;
            }

            const files = dt?.files;

            if (files && files.length > 0) {
                const fileInput = document.getElementById('fileInput') as HTMLInputElement;
                if (fileInput) {
                    fileInput.files = files;
                    handleFileUpload({ target: fileInput } as any);
                }
            }
        }, false);
    }

    // Edit channel button
    document.getElementById('editChannelBtn')?.addEventListener('click', () => {
        if (state.activeChannelId) {
            openChannelModal(state.activeChannelId);
        }
    });

    // Export channel button
    document.getElementById('exportChannelBtn')?.addEventListener('click', () => {
        if (state.activeChannelId) {
            const channel = state.channels.find(c => c.id === state.activeChannelId);
            if (channel && !channel.prompt) {
                // Shake the button if prompt is empty
                const btn = document.getElementById('exportChannelBtn');
                if (btn) {
                    shakeElement(btn as HTMLElement);
                }
                return;
            }
            exportChannel(state.activeChannelId);
        }
    });

    // Delete channel button
    const deleteBtn = document.getElementById('deleteChannelBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!state.activeChannelId) {
                return;
            }
            const confirmDelete = await customConfirm(t('confirmDeleteChannel'));
            if (confirmDelete) {
                deleteChannel(state.activeChannelId);
            }
        });
    }

    // Edit prompt button
    document.getElementById('editPromptBtn')?.addEventListener('click', () => {
        if (state.activeChannelId) {
            openChannelModal(state.activeChannelId);
        }
    });

    // Prompt variant navigation
    document.getElementById('prevPromptVariant')?.addEventListener('click', () => {
        navigatePromptVariant('prev');
    });

    document.getElementById('nextPromptVariant')?.addEventListener('click', () => {
        navigatePromptVariant('next');
    });

    document.getElementById('prevNegativePromptVariant')?.addEventListener('click', () => {
        navigateNegativePromptVariant('prev');
    });

    document.getElementById('nextNegativePromptVariant')?.addEventListener('click', () => {
        navigateNegativePromptVariant('next');
    });

    // Copy prompt button
    document.getElementById('copyPromptBtn')?.addEventListener('click', () => {
        if (!state.activeChannelId) return;

        const channel = state.channels.find(c => c.id === state.activeChannelId);
        if (!channel) return;

        // Get the currently active prompt variant
        const allPrompts = [channel.prompt, ...(channel.promptVariants || [])];
        const activeIndex = channel.activeVariantIndex || 0;
        const currentPrompt = allPrompts[activeIndex];

        if (!currentPrompt) {
            const btn = document.getElementById('copyPromptBtn');
            if (btn) {
                shakeElement(btn as HTMLElement);
            }
            return;
        }

        // Use universal copy function
        copyToClipboard(currentPrompt).then(success => {
            if (success) {
                // Visual feedback
                const btn = document.getElementById('copyPromptBtn');
                if (btn) {
                    btn.classList.add('copied');

                    // Create checkmark overlay
                    const overlay = document.createElement('span');
                    overlay.className = 'copy-checkmark-overlay';
                    overlay.textContent = '✅';
                    btn.appendChild(overlay);

                    setTimeout(() => {
                        btn.classList.remove('copied');
                        overlay.remove();
                    }, 1500);
                }
            } else {
                error('Failed to copy prompt');
            }
        });
    });

    // Edit negative prompt button
    document.getElementById('editNegativePromptBtn')?.addEventListener('click', () => {
        if (state.activeChannelId) {
            openChannelModal(state.activeChannelId);
        }
    });

    // Copy negative prompt button
    document.getElementById('copyNegativePromptBtn')?.addEventListener('click', () => {
        if (!state.activeChannelId) return;

        const channel = state.channels.find(c => c.id === state.activeChannelId);
        if (!channel) return;

        // Get the currently active negative prompt variant
        const allNegativePrompts = [channel.negativePrompt || '', ...(channel.negativePromptVariants || [])];
        const activeIndex = channel.activeNegativeVariantIndex || 0;
        const currentNegativePrompt = allNegativePrompts[activeIndex];

        if (!currentNegativePrompt) return;

        // Use universal copy function
        copyToClipboard(currentNegativePrompt).then(success => {
            if (success) {
                // Visual feedback
                const btn = document.getElementById('copyNegativePromptBtn');
                if (btn) {
                    btn.classList.add('copied');

                    // Create checkmark overlay
                    const overlay = document.createElement('span');
                    overlay.className = 'copy-checkmark-overlay';
                    overlay.textContent = '✅';
                    btn.appendChild(overlay);

                    setTimeout(() => {
                        btn.classList.remove('copied');
                        overlay.remove();
                    }, 1500);
                }
            } else {
                error('Failed to copy negative prompt');
            }
        });
    });

    // Image modal
    document.getElementById('closeImageModal')?.addEventListener('click', closeImageModal);
    document.getElementById('prevImageBtn')?.addEventListener('click', () => navigateImage('prev'));
    document.getElementById('nextImageBtn')?.addEventListener('click', () => navigateImage('next'));

    // Confirm modal
    document.getElementById('closeConfirmModal')?.addEventListener('click', () => closeConfirmModal(false));
    document.getElementById('confirmCancelBtn')?.addEventListener('click', () => closeConfirmModal(false));
    document.getElementById('confirmOkBtn')?.addEventListener('click', () => closeConfirmModal(true));

    // Prompt modal
    document.getElementById('closePromptModal')?.addEventListener('click', () => closePromptModal(null));
    document.getElementById('promptCancelBtn')?.addEventListener('click', () => closePromptModal(null));
    document.getElementById('promptOkBtn')?.addEventListener('click', () => {
        const inputEl = document.getElementById('promptInput') as HTMLInputElement;
        closePromptModal(inputEl.value);
    });

    // Allow Enter key to submit prompt
    document.getElementById('promptInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const inputEl = e.target as HTMLInputElement;
            closePromptModal(inputEl.value);
        } else if (e.key === 'Escape') {
            closePromptModal(null);
        }
    });

    // Setup modal backdrop close handlers
    setupModalBackdropClose('channelModal', closeChannelModal);
    setupModalBackdropClose('tagsModal', closeTagsModal);
    setupModalBackdropClose('imageModal', closeImageModal);
    setupModalBackdropClose('confirmModal', () => closeConfirmModal(false));
    setupModalBackdropClose('settingsModal', closeSettingsModal);
    setupModalBackdropClose('galleryModal', closeGalleryModal);
    setupModalBackdropClose('danbooruTagManagerModal', closeDanbooruTagManagerModal);

    // EVENT DELEGATION: Handle all gallery modal grid item clicks
    const allGalleryGrid = document.getElementById('allGalleryGrid');
    if (allGalleryGrid) {
        allGalleryGrid.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const galleryItem = target.closest('.gallery-grid-item');

            if (galleryItem) {
                const channelId = galleryItem.getAttribute('data-channel-id');
                const imageSrc = galleryItem.getAttribute('data-image-src');
                const channel = state.channels.find(c => c.id === channelId);

                if (channel && imageSrc) {
                    const imageIndex = channel.images.indexOf(imageSrc);
                    if (imageIndex !== -1) {
                        // Set active channel so navigation works
                        state.activeChannelId = channel.id;

                        // Mark that image modal was opened from gallery
                        openedFromGallery = true;

                        // Close gallery modal first
                        closeGalleryModal();

                        // Then open image modal with the image source and index
                        openImageModal(imageSrc, imageIndex);
                    }
                }
            }
        });
    }
}

// Channel functions
function createChannel(name: string, prompt: string, tags: string[]): Channel {
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
    const nameInput = document.getElementById('channelNameInput') as HTMLInputElement;
    const promptInput = document.getElementById('channelPromptInput') as HTMLTextAreaElement;
    const negativePromptInput = document.getElementById('channelNegativePromptInput') as HTMLTextAreaElement;
    const selectedTags = Array.from(document.querySelectorAll('.selected-tag'))
        .map(tag => tag.textContent?.replace('×', '').trim() || '');

    if (!nameInput.value.trim()) {
        const saveBtn = document.getElementById('saveChannelBtn');
        if (saveBtn) {
            shakeElement(saveBtn as HTMLElement);
        }
        return;
    }

    const modalTitle = document.getElementById('channelModalTitle')?.textContent;
    const isEditing = modalTitle?.includes('Edit');

    if (isEditing && state.activeChannelId) {
        // Update existing channel
        const channel = state.channels.find(c => c.id === state.activeChannelId);
        if (channel) {
            channel.name = nameInput.value.trim();
            channel.prompt = promptInput.value.trim();
            channel.negativePrompt = negativePromptInput.value.trim();
            channel.tags = selectedTags;
        }
    } else {
        // Create new channel
        const newChannel: Channel = {
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

    saveToStorage(); // Immediate save for channel create/update
    renderChannelsList();
    renderFilterTags();

    if (state.activeChannelId) {
        selectChannel(state.activeChannelId);
    }

    closeChannelModal();
}

function deleteChannel(channelId: string) {
    const channelIndex = state.channels.findIndex(c => c.id === channelId);
    if (channelIndex === -1) return;

    const deletedChannel = state.channels[channelIndex];

    // Add to undo stack
    addUndoAction({
        type: 'delete-channel',
        data: { ...deletedChannel },
        timestamp: Date.now()
    });

    state.channels = state.channels.filter(c => c.id !== channelId);

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

function toggleStar(channelId: string) {
    const channel = state.channels.find(c => c.id === channelId);
    if (!channel) return;

    channel.starred = !channel.starred;
    throttledSave();
    renderChannelsList();
}

function selectChannel(channelId: string) {
    state.activeChannelId = channelId;
    const channel = state.channels.find(c => c.id === channelId);

    if (!channel) return;

    // Initialize variant indices if not set
    if (channel.activeVariantIndex === undefined) channel.activeVariantIndex = 0;
    if (channel.activeNegativeVariantIndex === undefined) channel.activeNegativeVariantIndex = 0;

    // Update UI
    document.getElementById('emptyState')!.style.display = 'none';
    document.getElementById('channelView')!.style.display = 'block';

    // Update channel header
    document.getElementById('currentChannelName')!.textContent = channel.name;

    const tagsContainer = document.getElementById('currentChannelTags')!;
    tagsContainer.innerHTML = channel.tags.map(tag =>
        `<span class="channel-tag">${tag}</span>`
    ).join('');

    // Update prompt with variant support
    updatePromptDisplay(channel);

    // Update negative prompt with variant support
    updateNegativePromptDisplay(channel);

    // Update gallery
    renderGallery(channel);

    // Update active state in sidebar
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-id') === channelId);
    });
}

function updatePromptDisplay(channel: Channel) {
    const promptText = document.getElementById('promptText')!;
    const promptVariantNav = document.getElementById('promptVariantNav')!;
    const promptVariantCounter = document.getElementById('promptVariantCounter')!;

    // Get all prompts (main + variants)
    const allPrompts = [channel.prompt, ...(channel.promptVariants || [])];
    const activeIndex = channel.activeVariantIndex || 0;

    // Update prompt text
    promptText.textContent = allPrompts[activeIndex] || 'No prompt yet';

    // Show/hide variant navigation
    if (allPrompts.length > 1) {
        promptVariantNav.style.display = 'flex';
        promptVariantCounter.textContent = `${activeIndex + 1}/${allPrompts.length}`;
    } else {
        promptVariantNav.style.display = 'none';
    }
}

function updateNegativePromptDisplay(channel: Channel) {
    const negativePromptSection = document.getElementById('negativePromptSection')!;
    const negativePromptText = document.getElementById('negativePromptText')!;
    const negativePromptVariantNav = document.getElementById('negativePromptVariantNav')!;
    const negativePromptVariantCounter = document.getElementById('negativePromptVariantCounter')!;

    // Get all negative prompts (main + variants)
    const allNegativePrompts = [channel.negativePrompt || '', ...(channel.negativePromptVariants || [])];
    const activeIndex = channel.activeNegativeVariantIndex || 0;
    const currentNegativePrompt = allNegativePrompts[activeIndex];

    // Show/hide section
    if (currentNegativePrompt && currentNegativePrompt.trim()) {
        negativePromptSection.style.display = 'block';
        negativePromptText.textContent = currentNegativePrompt;

        // Show/hide variant navigation
        if (allNegativePrompts.filter(p => p && p.trim()).length > 1) {
            negativePromptVariantNav.style.display = 'flex';
            negativePromptVariantCounter.textContent = `${activeIndex + 1}/${allNegativePrompts.length}`;
        } else {
            negativePromptVariantNav.style.display = 'none';
        }
    } else {
        negativePromptSection.style.display = 'none';
    }
}

function navigatePromptVariant(direction: 'prev' | 'next') {
    if (!state.activeChannelId) return;
    const channel = state.channels.find(c => c.id === state.activeChannelId);
    if (!channel) return;

    const allPrompts = [channel.prompt, ...(channel.promptVariants || [])];
    const currentIndex = channel.activeVariantIndex || 0;

    if (direction === 'next') {
        channel.activeVariantIndex = (currentIndex + 1) % allPrompts.length;
    } else {
        channel.activeVariantIndex = currentIndex === 0 ? allPrompts.length - 1 : currentIndex - 1;
    }

    updatePromptDisplay(channel);
    throttledSave();
}

function navigateNegativePromptVariant(direction: 'prev' | 'next') {
    if (!state.activeChannelId) return;
    const channel = state.channels.find(c => c.id === state.activeChannelId);
    if (!channel) return;

    const allNegativePrompts = [channel.negativePrompt || '', ...(channel.negativePromptVariants || [])];
    const currentIndex = channel.activeNegativeVariantIndex || 0;

    if (direction === 'next') {
        channel.activeNegativeVariantIndex = (currentIndex + 1) % allNegativePrompts.length;
    } else {
        channel.activeNegativeVariantIndex = currentIndex === 0 ? allNegativePrompts.length - 1 : currentIndex - 1;
    }

    updateNegativePromptDisplay(channel);
    throttledSave();
}

function showEmptyState() {
    document.getElementById('emptyState')!.style.display = 'flex';
    document.getElementById('channelView')!.style.display = 'none';
}

// Render functions
// Virtual scrolling state
const CHANNELS_BUFFER_SIZE = 20; // Number of channels to render at once

// Memoization cache for channel filtering
let channelsCache: {
    filters: string[];
    query: string;
    channelsHash: string;
    result: Channel[];
} | null = null;

// Pagination state for channels
let channelPage = 0;
const CHANNELS_PER_PAGE = 20;

function getChannelsHash(channels: Channel[]): string {
    // Simple hash based on length and first/last channel IDs
    if (channels.length === 0) return '0';
    return `${channels.length}-${channels[0].id}-${channels[channels.length - 1].id}`;
}

function renderChannelsList() {
    const container = document.getElementById('channelsList')!;

    // Check if we can use cached results
    const currentHash = getChannelsHash(state.channels);
    const filtersKey = state.activeFilters.join(',');
    const queryKey = state.searchQuery || '';

    let sortedChannels: Channel[];

    if (channelsCache &&
        channelsCache.channelsHash === currentHash &&
        channelsCache.filters.join(',') === filtersKey &&
        channelsCache.query === queryKey) {
        // Use cached result
        sortedChannels = channelsCache.result;
    } else {
        // Perform filtering and sorting
        let filteredChannels = state.channels;

        if (state.activeFilters.length > 0) {
            // Multi-tag filtering: show channels that have ALL selected tags
            filteredChannels = state.channels.filter(c =>
                state.activeFilters.every(tag => c.tags.includes(tag))
            );
        }

        // Filter by search query
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            filteredChannels = filteredChannels.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.prompt.toLowerCase().includes(query) ||
                c.tags.some(tag => tag.toLowerCase().includes(query))
            );
        }

        // Sort: starred channels first, then by order (if set), then by creation date
        sortedChannels = [...filteredChannels].sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return b.createdAt - a.createdAt;
        });

        // Cache the result
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

    // Pagination logic
    const totalPages = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
    const startIndex = channelPage * CHANNELS_PER_PAGE;
    const endIndex = Math.min(startIndex + CHANNELS_PER_PAGE, sortedChannels.length);
    const channelsToRender = sortedChannels.slice(startIndex, endIndex);

    container.innerHTML = channelsToRender.map(channel => {
        const previewImage = channel.images[0] || '';
        const previewPrompt = channel.prompt || 'No prompt yet';
        const isStarred = channel.starred || false;

        return `
            <div class="channel-item ${isStarred ? 'starred' : ''}"
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
                    <button class="btn-star" data-id="${channel.id}" title="${isStarred ? 'Unstar' : 'Star'} channel">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                </div>
                <div class="channel-item-preview">
                    ${previewImage ? `<img src="${previewImage}" alt="Preview" class="preview-image">` : ''}
                    <div class="preview-prompt">${previewPrompt}</div>
                </div>
                ${channel.tags.length > 0 ? `
                    <div class="channel-item-tags">
                        ${channel.tags.map(tag => `<span class="mini-tag">${tag}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add click listeners for channel selection
    container.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't select channel if clicking the star button or drag handle
            if ((e.target as HTMLElement).closest('.btn-star')) return;
            if ((e.target as HTMLElement).closest('.drag-handle')) return;
            const id = item.getAttribute('data-id');
            if (id) selectChannel(id);
        });
    });

    // Add click listeners for star buttons
    container.querySelectorAll('.btn-star').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            if (id) toggleStar(id);
        });
    });

    // Add drag and drop listeners
    setupChannelDragAndDrop();

    // Render pagination controls if there are more than CHANNELS_PER_PAGE channels
    const paginationContainer = document.getElementById('channelsPagination');
    if (paginationContainer) {
        if (sortedChannels.length > CHANNELS_PER_PAGE) {
            const totalPages = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
            paginationContainer.innerHTML = `
                <div class="channels-pagination">
                    <button class="btn-channel-nav" id="prevChannelPage">‹</button>
                    <span class="channel-page-info">${channelPage + 1} / ${totalPages}</span>
                    <button class="btn-channel-nav" id="nextChannelPage">›</button>
                </div>
            `;

            // Add event listeners for pagination buttons with circular navigation
            document.getElementById('prevChannelPage')?.addEventListener('click', () => {
                const totalPages = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
                if (channelPage > 0) {
                    channelPage--;
                } else {
                    // Circular: go to last page
                    channelPage = totalPages - 1;
                }
                renderChannelsList();
            });

            document.getElementById('nextChannelPage')?.addEventListener('click', () => {
                const totalPages = Math.ceil(sortedChannels.length / CHANNELS_PER_PAGE);
                if (channelPage < totalPages - 1) {
                    channelPage++;
                } else {
                    // Circular: go to first page
                    channelPage = 0;
                }
                renderChannelsList();
            });
        } else {
            paginationContainer.innerHTML = '';
        }
    }
}

function renderFilterTags() {
    const container = document.getElementById('filterTags')!;
    const paginationContainer = document.getElementById('tagsPagination')!;
    const actionsContainer = document.getElementById('tagsActions')!;

    const totalPages = Math.ceil(state.tags.length / state.tagsPerPage);
    const startIndex = state.currentTagPage * state.tagsPerPage;
    const endIndex = Math.min(startIndex + state.tagsPerPage, state.tags.length);
    const visibleTags = state.tags.slice(startIndex, endIndex);

    const isAllActive = state.activeFilter === 'all' && state.activeFilters.length === 0;

    // Pre-convert emojis to Twemoji BEFORE inserting into DOM
    const allButtonHTML = `<button class="tag-filter ${isAllActive ? 'active' : ''}" data-tag="all" aria-pressed="${isAllActive}" aria-label="Show all channels">All</button>`;
    const tagButtonsHTML = visibleTags.map(tag => {
        const isActive = state.activeFilters.includes(tag);
        return `<button class="tag-filter ${isActive ? 'active' : ''}" data-tag="${tag}" aria-pressed="${isActive}" aria-label="Filter by ${tag}">${tag}</button>`;
    }).join('');

    container.innerHTML = allButtonHTML + tagButtonsHTML;

    // Show/hide clear filters button
    if (state.activeFilters.length > 0) {
        actionsContainer.style.display = 'flex';
    } else {
        actionsContainer.style.display = 'none';
    }

    // Show/hide pagination
    if (state.tags.length > state.tagsPerPage) {
        paginationContainer.style.display = 'flex';
        const pageInfo = document.getElementById('tagPageInfo')!;
        pageInfo.textContent = `${state.currentTagPage + 1} / ${totalPages}`;

        // Enable/disable buttons
        const prevBtn = document.getElementById('prevTagPage') as HTMLButtonElement;
        const nextBtn = document.getElementById('nextTagPage') as HTMLButtonElement;
        prevBtn.disabled = state.currentTagPage === 0;
        nextBtn.disabled = state.currentTagPage >= totalPages - 1;
    } else {
        paginationContainer.style.display = 'none';
    }

    // Add click listeners
    container.querySelectorAll('.tag-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tag = btn.getAttribute('data-tag') || 'all';

            if (tag === 'all') {
                // Check if already showing all (no filters active)
                if (state.activeFilter === 'all' && state.activeFilters.length === 0) {
                    shakeElement(btn);
                    return;
                }
                // Clear all filters
                state.activeFilter = 'all';
                state.activeFilters = [];
            } else {
                // Toggle tag in multi-select
                const index = state.activeFilters.indexOf(tag);
                if (index === -1) {
                    // Add tag to filters
                    state.activeFilters.push(tag);
                } else {
                    // Remove tag from filters
                    state.activeFilters.splice(index, 1);
                }

                // Update activeFilter for backward compatibility
                if (state.activeFilters.length === 0) {
                    state.activeFilter = 'all';
                } else {
                    state.activeFilter = state.activeFilters[0];
                }
            }

            renderFilterTags();
            renderChannelsList();
        });
    });
}

// Helper function to create a gallery item element
function createGalleryItemElement(img: string, index: number, isSelected: boolean): HTMLDivElement {
    const div = document.createElement('div');
    div.className = `gallery-item ${isSelected ? 'selected-for-comparison' : ''}`;
    div.setAttribute('data-index', String(index));
    div.setAttribute('data-image-url', img);
    div.style.setProperty('--hover-image', `url(${img})`);

    // Accessibility improvements
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', `Image ${index + 1}${isSelected ? ', selected for comparison' : ''}`);

    const imgElement = document.createElement('img');
    imgElement.src = img;
    imgElement.alt = `Generated image ${index + 1}`;
    imgElement.style.background = 'var(--burgundy-light)';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-gallery-image';
    deleteBtn.setAttribute('data-index', String(index));
    deleteBtn.setAttribute('aria-label', `Delete image ${index + 1}`);
    deleteBtn.title = 'Delete image';
    deleteBtn.textContent = '×';

    div.appendChild(imgElement);
    div.appendChild(deleteBtn);
    return div;
}

// Helper function to setup lazy loading for gallery images
function setupGalleryLazyLoading(container: HTMLElement, channel: Channel, sentinel: HTMLElement, bufferSize: number): void {
    const sentinelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                try {
                    const currentCount = container.querySelectorAll('.gallery-item').length;
                    const nextBatch = channel.images.slice(currentCount, currentCount + bufferSize);

                    if (nextBatch.length > 0) {
                        nextBatch.forEach((img, idx) => {
                            const isSelected = selectedImagesForComparison.includes(img);
                            const div = createGalleryItemElement(img, currentCount + idx, isSelected);

                            // Defensive check: ensure div is a valid DOM element and sentinel exists
                            if (div && div instanceof HTMLElement && sentinel && sentinel.parentNode === container) {
                                container.insertBefore(div, sentinel);
                            } else {
                                error('Invalid element for insertBefore:', { div, sentinel, container });
                            }
                        });
                    }

                    // If we've loaded all images, remove sentinel
                    if (container.querySelectorAll('.gallery-item').length >= channel.images.length) {
                        sentinelObserver.disconnect();
                        if (sentinel && sentinel.parentNode) {
                            sentinel.remove();
                        }
                    }
                } catch (e) {
                    error('Error in lazy loading observer:', e);
                    sentinelObserver.disconnect();
                }
            }
        });
    }, { rootMargin: '200px' });

    sentinelObserver.observe(sentinel);
}

function renderGallery(channel: Channel) {
    const container = document.getElementById('galleryGrid')!;

    if (channel.images.length === 0) {
        container.innerHTML = `
            <div class="gallery-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>${translations[state.language || 'en'].noImages}</p>
            </div>
        `;
        return;
    }

    // Virtual scrolling for large image galleries
    const IMAGES_BUFFER_SIZE = 50; // Render 50 images at a time
    const imagesToRender = channel.images.length > IMAGES_BUFFER_SIZE
        ? channel.images.slice(0, IMAGES_BUFFER_SIZE)
        : channel.images;

    // Render images - first batch loads immediately, using DocumentFragment
    const fragment = document.createDocumentFragment();

    imagesToRender.forEach((img, index) => {
        const isSelected = selectedImagesForComparison.includes(img);
        const div = createGalleryItemElement(img, index, isSelected);
        fragment.appendChild(div);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    // If there are more images, add a sentinel element to trigger loading more
    if (channel.images.length > IMAGES_BUFFER_SIZE) {
        const sentinel = document.createElement('div');
        sentinel.className = 'gallery-sentinel';
        sentinel.style.gridColumn = '1 / -1';
        sentinel.style.height = '1px';
        container.appendChild(sentinel);

        // Setup lazy loading observer
        setupGalleryLazyLoading(container, channel, sentinel, IMAGES_BUFFER_SIZE);
    }

    // Event delegation is now handled globally - no need for individual listeners

    // Setup drag and drop for images
    setupImageDragAndDrop(channel);
}

// Delete image from gallery with confirmation
async function deleteImageFromGallery(channel: Channel, index: number) {
    try {
        // Use customConfirm instead of confirm() for sandboxed environments
        const confirmed = await customConfirm('Are you sure you want to delete this image?');

        if (!confirmed) {
            return;
        }

        // Validate index
        if (index < 0 || index >= channel.images.length) {
            showErrorNotification('Invalid image index. Please refresh and try again.');
            return;
        }

        // Find the gallery item element and add deleting state
        const galleryItems = document.querySelectorAll('.gallery-item');
        const itemToDelete = galleryItems[index] as HTMLElement;

        if (itemToDelete) {
            itemToDelete.classList.add('deleting');
        }

        // Small delay to show the loading animation
        await new Promise(resolve => setTimeout(resolve, 400));

        // Remove image from channel
        channel.images.splice(index, 1);

        // Save and re-render
        saveToStorage();
        renderGallery(channel);
        renderChannelsList();

        showSuccessNotification('Image deleted successfully.');
    } catch (e) {
        error('Failed to delete image:', e);
        showErrorNotification('Failed to delete image. Please try again.');

        // Remove deleting state if error occurred
        const galleryItems = document.querySelectorAll('.gallery-item');
        const itemToDelete = galleryItems[index] as HTMLElement;
        if (itemToDelete) {
            itemToDelete.classList.remove('deleting');
        }
    }
}

// Variant management functions
function renderPromptVariantsInModal(channel: Channel) {
    const variantsList = document.getElementById('promptVariantsList')!;
    const variants = channel.promptVariants || [];

    if (variants.length === 0) {
        variantsList.innerHTML = '';
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
    `).join('');

    // Add click-to-edit event listeners
    variantsList.querySelectorAll('.variant-text').forEach(span => {
        span.addEventListener('click', (e) => {
            const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0');
            editPromptVariant(channel, index, e.currentTarget as HTMLElement);
        });
    });

    // Add delete button event listeners
    variantsList.querySelectorAll('.btn-delete-variant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0');
            deletePromptVariant(channel, index);
        });
    });
}

function renderNegativePromptVariantsInModal(channel: Channel) {
    const variantsList = document.getElementById('negativePromptVariantsList')!;
    const variants = channel.negativePromptVariants || [];

    if (variants.length === 0) {
        variantsList.innerHTML = '';
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
    `).join('');

    // Add click-to-edit event listeners
    variantsList.querySelectorAll('.variant-text').forEach(span => {
        span.addEventListener('click', (e) => {
            const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0');
            editNegativePromptVariant(channel, index, e.currentTarget as HTMLElement);
        });
    });

    // Add delete button event listeners
    variantsList.querySelectorAll('.btn-delete-variant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0');
            deleteNegativePromptVariant(channel, index);
        });
    });
}

function addPromptVariant() {
    const promptInput = document.getElementById('channelPromptInput') as HTMLTextAreaElement;
    const newVariant = promptInput.value.trim();

    if (!newVariant) {
        const btn = document.getElementById('addPromptVariantBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    // Get the channel being edited
    const modalTitle = document.getElementById('channelModalTitle')?.textContent;
    const isEditing = modalTitle?.includes('Edit');

    if (isEditing && state.activeChannelId) {
        const channel = state.channels.find(c => c.id === state.activeChannelId);
        if (channel) {
            if (!channel.promptVariants) {
                channel.promptVariants = [];
            }
            channel.promptVariants.push(newVariant);
            renderPromptVariantsInModal(channel);
        }
    } else {
        alert('Please save the channel first before adding variants');
    }
}

function addNegativePromptVariant() {
    const negativePromptInput = document.getElementById('channelNegativePromptInput') as HTMLTextAreaElement;
    const newVariant = negativePromptInput.value.trim();

    if (!newVariant) {
        const btn = document.getElementById('addNegativePromptVariantBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    // Get the channel being edited
    const modalTitle = document.getElementById('channelModalTitle')?.textContent;
    const isEditing = modalTitle?.includes('Edit');

    if (isEditing && state.activeChannelId) {
        const channel = state.channels.find(c => c.id === state.activeChannelId);
        if (channel) {
            if (!channel.negativePromptVariants) {
                channel.negativePromptVariants = [];
            }
            channel.negativePromptVariants.push(newVariant);
            renderNegativePromptVariantsInModal(channel);
        }
    } else {
        alert('Please save the channel first before adding variants');
    }
}

function editPromptVariant(channel: Channel, index: number, element: HTMLElement) {
    const currentText = channel.promptVariants?.[index] || '';

    // Create textarea for inline editing
    const textarea = document.createElement('textarea');
    textarea.className = 'variant-edit-input';
    textarea.value = currentText;
    textarea.rows = 3;

    // Replace the span with textarea
    const parent = element.parentElement;
    if (!parent) {
        error('Parent element not found for variant editing');
        return;
    }

    element.style.display = 'none';

    // Defensive check: ensure parent exists before insertBefore
    try {
        parent.insertBefore(textarea, element);
        textarea.focus();
    } catch (e) {
        error('Failed to insert textarea for editing:', e);
        element.style.display = '';
        return;
    }

    // Save on blur or Enter
    const saveEdit = () => {
        const newText = textarea.value.trim();
        if (newText && newText !== currentText) {
            if (!channel.promptVariants) channel.promptVariants = [];
            channel.promptVariants[index] = newText;

            // Update display if this is the active channel
            if (state.activeChannelId === channel.id) {
                updatePromptDisplay(channel);
            }
        }
        renderPromptVariantsInModal(channel);
    };

    textarea.addEventListener('blur', saveEdit);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textarea.blur();
        }
        if (e.key === 'Escape') {
            renderPromptVariantsInModal(channel);
        }
    });
}

function editNegativePromptVariant(channel: Channel, index: number, element: HTMLElement) {
    const currentText = channel.negativePromptVariants?.[index] || '';

    // Create textarea for inline editing
    const textarea = document.createElement('textarea');
    textarea.className = 'variant-edit-input';
    textarea.value = currentText;
    textarea.rows = 3;

    // Replace the span with textarea
    const parent = element.parentElement;
    if (!parent) {
        error('Parent element not found for negative variant editing');
        return;
    }

    element.style.display = 'none';

    // Defensive check: ensure parent exists before insertBefore
    try {
        parent.insertBefore(textarea, element);
        textarea.focus();
    } catch (e) {
        error('Failed to insert textarea for editing:', e);
        element.style.display = '';
        return;
    }

    // Save on blur or Enter
    const saveEdit = () => {
        const newText = textarea.value.trim();
        if (newText && newText !== currentText) {
            if (!channel.negativePromptVariants) channel.negativePromptVariants = [];
            channel.negativePromptVariants[index] = newText;

            // Update display if this is the active channel
            if (state.activeChannelId === channel.id) {
                updateNegativePromptDisplay(channel);
            }
        }
        renderNegativePromptVariantsInModal(channel);
    };

    textarea.addEventListener('blur', saveEdit);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textarea.blur();
        }
        if (e.key === 'Escape') {
            renderNegativePromptVariantsInModal(channel);
        }
    });
}

function deletePromptVariant(channel: Channel, index: number) {
    if (!channel.promptVariants) return;

    channel.promptVariants.splice(index, 1);

    // Adjust activeVariantIndex if needed
    if (channel.activeVariantIndex && channel.activeVariantIndex > index + 1) {
        channel.activeVariantIndex--;
    } else if (channel.activeVariantIndex === index + 1) {
        channel.activeVariantIndex = 0; // Reset to main prompt
    }

    renderPromptVariantsInModal(channel);

    // Update display if this is the active channel
    if (state.activeChannelId === channel.id) {
        updatePromptDisplay(channel);
    }
}

function deleteNegativePromptVariant(channel: Channel, index: number) {
    if (!channel.negativePromptVariants) return;

    channel.negativePromptVariants.splice(index, 1);

    // Adjust activeNegativeVariantIndex if needed
    if (channel.activeNegativeVariantIndex && channel.activeNegativeVariantIndex > index + 1) {
        channel.activeNegativeVariantIndex--;
    } else if (channel.activeNegativeVariantIndex === index + 1) {
        channel.activeNegativeVariantIndex = 0; // Reset to main prompt
    }

    renderNegativePromptVariantsInModal(channel);

    // Update display if this is the active channel
    if (state.activeChannelId === channel.id) {
        updateNegativePromptDisplay(channel);
    }
}

// Modal functions
function openChannelModal(channelId?: string) {
    const modal = document.getElementById('channelModal')!;
    const title = document.getElementById('channelModalTitle')!;
    const nameInput = document.getElementById('channelNameInput') as HTMLInputElement;
    const promptInput = document.getElementById('channelPromptInput') as HTMLTextAreaElement;
    const negativePromptInput = document.getElementById('channelNegativePromptInput') as HTMLTextAreaElement;
    const selectedTagsContainer = document.getElementById('selectedTags')!;

    selectedTagsContainer.innerHTML = '';

    if (channelId) {
        const channel = state.channels.find(c => c.id === channelId);
        if (channel) {
            title.textContent = 'Edit Channel';
            nameInput.value = channel.name;
            promptInput.value = channel.prompt;
            negativePromptInput.value = channel.negativePrompt || '';

            // Add tags with proper event listeners
            channel.tags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'selected-tag';
                tagElement.innerHTML = `${tag}<button class="remove-tag">×</button>`;

                const removeBtn = tagElement.querySelector('.remove-tag');
                removeBtn?.addEventListener('click', () => {
                    tagElement.remove();
                    renderAvailableTags();
                });

                selectedTagsContainer.appendChild(tagElement);
            });

            // Render existing variants
            renderPromptVariantsInModal(channel);
            renderNegativePromptVariantsInModal(channel);
        }
    } else {
        title.textContent = 'Create New Channel';
        nameInput.value = '';
        promptInput.value = '';
        negativePromptInput.value = '';

        // Clear variant lists for new channels
        document.getElementById('promptVariantsList')!.innerHTML = '';
        document.getElementById('negativePromptVariantsList')!.innerHTML = '';
    }

    renderAvailableTags();
    modal.classList.add('active');
    nameInput.focus();

    // Add autocomplete event listeners for Danbooru tags
    // Remove any existing data attribute to prevent duplicate listeners
    if (!promptInput.dataset.autocompleteInit) {
        promptInput.addEventListener('input', () => {
            const cursorPos = promptInput.selectionStart;
            const currentWord = getCurrentWord(promptInput.value, cursorPos);
            debouncedAutocomplete(currentWord, promptInput);
        });

        promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
            handleAutocompleteKeydown(e, promptInput);
        });

        promptInput.dataset.autocompleteInit = 'true';
    }
}

function closeChannelModal() {
    document.getElementById('channelModal')!.classList.remove('active');
    // Hide autocomplete when modal closes
    const autocomplete = document.getElementById('tagAutocomplete');
    if (autocomplete) {
        autocomplete.style.display = 'none';
    }
    autocompleteSelectedIndex = -1;
}

function openTagsModal() {
    renderExistingTags();
    document.getElementById('tagsModal')!.classList.add('active');
}

function closeTagsModal() {
    document.getElementById('tagsModal')!.classList.remove('active');
}

let currentImageIndex = 0;
let openedFromGallery = false;

function openImageModal(imageSrc: string, index: number) {
    const modal = document.getElementById('imageModal')!;
    const img = document.getElementById('modalImage') as HTMLImageElement;

    img.src = imageSrc;
    currentImageIndex = index;
    modal.classList.add('active');

    // Apply theme-appropriate background to image modal
    log('🎨 Image modal theme:', Theme.current);

    // Force apply theme-based background via JavaScript since CSS isn't working
    const modalContent = document.querySelector('.image-modal-content') as HTMLElement;

    modal.style.background = Theme.getModalBg();
    if (modalContent) {
        modalContent.style.background = Theme.getContentBg();
        modalContent.style.borderColor = Theme.getBorderColor();
    }
    log(`✅ Image modal: ${Theme.current} theme background`);

    // Check modal content background after a moment to see what was applied
    setTimeout(() => {
        if (modalContent) {
            const computedBg = window.getComputedStyle(modalContent).background;
            log('📊 Image modal content computed background:', computedBg);
        }
        const modalBg = window.getComputedStyle(modal).background;
        log('📊 Image modal overlay computed background:', modalBg);
    }, 100);

    // Calculate and display image metadata
    const image = new Image();
    image.onload = function() {
        const dimensions = `${image.width} × ${image.height}`;
        const sizeInBytes = Math.round((imageSrc.length * 3) / 4); // Approximate base64 size
        const sizeInKB = (sizeInBytes / 1024).toFixed(1);
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

        const dimensionsEl = document.getElementById('imageDimensions');
        const sizeEl = document.getElementById('imageSize');

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

    const channel = state.channels.find(c => c.id === state.activeChannelId);
    if (!channel) return;

    const prevBtn = document.getElementById('prevImageBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextImageBtn') as HTMLButtonElement;

    const totalImages = channel.images.length;

    // Always show navigation if there's more than one image (circular navigation)
    if (totalImages > 1) {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
    } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    }
}

function navigateImage(direction: 'prev' | 'next') {
    if (!state.activeChannelId) return;

    const channel = state.channels.find(c => c.id === state.activeChannelId);
    if (!channel) return;

    const totalImages = channel.images.length;

    // If opened from gallery, reverse navigation (newest first)
    // If opened from channel, normal navigation (oldest first)
    if (openedFromGallery) {
        if (direction === 'prev') {
            // Gallery: prev goes forward in array (newer images)
            currentImageIndex = currentImageIndex < totalImages - 1 ? currentImageIndex + 1 : 0;
        } else if (direction === 'next') {
            // Gallery: next goes backward in array (older images)
            currentImageIndex = currentImageIndex > 0 ? currentImageIndex - 1 : totalImages - 1;
        }
    } else {
        if (direction === 'prev') {
            // Channel: prev goes backward in array (normal)
            currentImageIndex = currentImageIndex > 0 ? currentImageIndex - 1 : totalImages - 1;
        } else if (direction === 'next') {
            // Channel: next goes forward in array (normal)
            currentImageIndex = currentImageIndex < totalImages - 1 ? currentImageIndex + 1 : 0;
        }
    }

    const img = document.getElementById('modalImage') as HTMLImageElement;
    img.src = channel.images[currentImageIndex];

    updateImageNavigation();
}

function closeImageModal() {
    document.getElementById('imageModal')!.classList.remove('active');

    // If opened from gallery, return to gallery
    if (openedFromGallery) {
        openedFromGallery = false;
        openGalleryModal();
    }
}

async function deleteCurrentImage() {
    if (!state.activeChannelId) return;

    const channel = state.channels.find(c => c.id === state.activeChannelId);
    if (!channel) return;

    const confirmDelete = await customConfirm('Are you sure you want to delete this image?');
    if (confirmDelete) {
        const deletedImage = channel.images[currentImageIndex];

        // Add to undo stack
        addUndoAction({
            type: 'delete-image',
            data: {
                channelId: state.activeChannelId,
                imageUrl: deletedImage,
                index: currentImageIndex
            },
            timestamp: Date.now()
        });

        // Remove from comparison selection if it was selected
        const comparisonIndex = selectedImagesForComparison.indexOf(deletedImage);
        if (comparisonIndex !== -1) {
            selectedImagesForComparison.splice(comparisonIndex, 1);
            updateCompareButton();
        }

        // Remove the image from the channel
        channel.images.splice(currentImageIndex, 1);

        // Close modal first to prevent visual glitch
        closeImageModal();

        // Save to storage
        saveToStorage();

        // Force re-render the gallery
        renderGallery(channel);

        // Update channels list
        renderChannelsList();
    }
}

// Tag functions
function addTagToChannel() {
    const input = document.getElementById('tagInput') as HTMLInputElement;
    const tagName = input.value.trim();

    if (!tagName) return;

    const selectedTags = Array.from(document.querySelectorAll('.selected-tag'))
        .map(tag => tag.textContent?.replace('×', '').trim() || '');

    if (selectedTags.includes(tagName)) {
        input.value = '';
        return;
    }

    // Add to available tags if not exists
    if (!state.tags.includes(tagName)) {
        state.tags.push(tagName);
        throttledSave();
    }

    const selectedTagsContainer = document.getElementById('selectedTags')!;
    const tagElement = document.createElement('span');
    tagElement.className = 'selected-tag';
    tagElement.innerHTML = `${tagName}<button class="remove-tag">×</button>`;

    const removeBtn = tagElement.querySelector('.remove-tag');
    removeBtn?.addEventListener('click', () => {
        tagElement.remove();
    });

    selectedTagsContainer.appendChild(tagElement);

    input.value = '';
    renderAvailableTags();
}

function renderAvailableTags() {
    const container = document.getElementById('availableTags')!;
    const selectedTags = Array.from(document.querySelectorAll('.selected-tag'))
        .map(tag => tag.textContent?.replace('×', '').trim() || '');

    const availableTags = state.tags.filter(tag => !selectedTags.includes(tag));

    container.innerHTML = '';

    availableTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'available-tag';
        btn.textContent = tag;
        btn.addEventListener('click', () => addExistingTag(tag));
        container.appendChild(btn);
    });
}

function addExistingTag(tagName: string) {
    const selectedTagsContainer = document.getElementById('selectedTags')!;

    const tagElement = document.createElement('span');
    tagElement.className = 'selected-tag';
    tagElement.innerHTML = `${tagName}<button class="remove-tag">×</button>`;

    const removeBtn = tagElement.querySelector('.remove-tag');
    removeBtn?.addEventListener('click', () => {
        tagElement.remove();
        renderAvailableTags();
    });

    selectedTagsContainer.appendChild(tagElement);
    renderAvailableTags();
}

function addNewTag() {
    const input = document.getElementById('newTagInput') as HTMLInputElement;
    const tagName = input.value.trim();

    if (!tagName) {
        const addBtn = document.getElementById('addTagBtn');
        if (addBtn) {
            shakeElement(addBtn as HTMLElement);
        }
        return;
    }

    if (state.tags.includes(tagName)) {
        alert('This tag already exists');
        return;
    }

    state.tags.push(tagName);
    throttledSave();
    renderExistingTags();
    renderFilterTags();
    input.value = '';
}

function renderExistingTags() {
    const container = document.getElementById('existingTagsList')!;

    log('📋 Rendering existing tags. Total tags:', state.tags.length);
    log('🏷️ All tags:', state.tags);

    if (state.tags.length === 0) {
        container.innerHTML = '<p style="color: var(--cream-dark); font-size: 14px; text-align: center; padding: 20px;">No tags created yet</p>';
        return;
    }

    container.innerHTML = '';

    state.tags.forEach(tag => {
        log('🔨 Creating tag item for:', tag);
        const item = document.createElement('div');
        item.className = 'existing-tag-item';
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-tag', tag);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'existing-tag-name';
        nameSpan.textContent = tag;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'tag-buttons';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit-tag';
        editBtn.title = 'Edit tag';
        editBtn.setAttribute('data-tag-name', tag); // Store tag name in attribute
        editBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        `;

        // Add click handler with detailed logging
        const clickHandler = (e: Event) => {
            log('🎯 CLICK EVENT FIRED!');
            log('🎯 Event target:', e.target);
            log('🎯 Event currentTarget:', e.currentTarget);
            e.preventDefault();
            e.stopPropagation();

            const tagName = (e.currentTarget as HTMLElement).getAttribute('data-tag-name')!;
            log('🖱️ Edit button clicked for tag:', tagName);
            log('📦 Tag from closure:', tag);
            log('🏷️ Tag from attribute:', tagName);
            editTag(tagName);
        };

        editBtn.addEventListener('click', clickHandler);
        log('✅ Created edit button for tag:', tag);
        log('✅ Attached click listener to button');

        // Test if button is clickable
        editBtn.style.pointerEvents = 'auto';
        editBtn.style.cursor = 'pointer';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-tag';
        deleteBtn.textContent = t('delete');
        deleteBtn.addEventListener('click', async () => {
            const confirmDelete = await customConfirm(t('confirmDeleteTag'));
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

function deleteTag(tagName: string) {
    // Store affected channels for undo
    const affectedChannels = state.channels
        .filter(c => c.tags.includes(tagName))
        .map(c => ({ id: c.id, tags: [...c.tags] }));

    // Add to undo stack
    addUndoAction({
        type: 'delete-tag',
        data: {
            tagName,
            affectedChannels
        },
        timestamp: Date.now()
    });

    state.tags = state.tags.filter(t => t !== tagName);
    state.channels.forEach(channel => {
        channel.tags = channel.tags.filter(t => t !== tagName);
    });

    if (state.activeFilter === tagName) {
        state.activeFilter = 'all';
    }

    saveToStorage();
    renderExistingTags();
    renderFilterTags();
    renderChannelsList();

    if (state.activeChannelId) {
        selectChannel(state.activeChannelId);
    }
}

async function editTag(oldTagName: string) {
    log('🏷️ Edit tag called with:', oldTagName);

    try {
        // Use custom prompt modal instead of browser prompt
        const message = t('enterNewTagName');
        log('📝 Showing custom prompt modal...');
        const newTagName = await customPrompt(message, oldTagName);
        log('📝 Custom prompt returned:', newTagName);

        if (newTagName === null) {
            log('❌ User cancelled prompt');
            return;
        }

        if (newTagName.trim() === '') {
            log('❌ Edit cancelled - empty name');
            alert('Tag name cannot be empty');
            return;
        }

        const trimmedName = newTagName.trim();
        log('✂️ Trimmed name:', trimmedName);

        if (trimmedName === oldTagName) {
            log('ℹ️ Name unchanged');
            return;
        }

        if (state.tags.includes(trimmedName)) {
            log('⚠️ Duplicate tag name:', trimmedName);
            alert('A tag with this name already exists');
            return;
        }

        // Update tag in state
        const tagIndex = state.tags.indexOf(oldTagName);
        log('📍 Tag index in state.tags:', tagIndex);
        if (tagIndex !== -1) {
            state.tags[tagIndex] = trimmedName;
            log('✅ Updated state.tags:', state.tags);
        }

        // Update tag in all channels
        let channelsUpdated = 0;
        state.channels.forEach(channel => {
            const channelTagIndex = channel.tags.indexOf(oldTagName);
            if (channelTagIndex !== -1) {
                channel.tags[channelTagIndex] = trimmedName;
                channelsUpdated++;
                log(`✅ Updated channel "${channel.name}"`);
            }
        });
        log(`📊 Total channels updated: ${channelsUpdated}`);

        // Update active filter if needed
        if (state.activeFilter === oldTagName) {
            state.activeFilter = trimmedName;
            log('🔍 Updated active filter to:', trimmedName);
        }

        log('💾 Saving to storage...');
        saveToStorage();

        log('🔄 Re-rendering UI...');
        renderExistingTags();
        renderFilterTags();
        renderChannelsList();

        if (state.activeChannelId) {
            selectChannel(state.activeChannelId);
        }

        log('✅ Edit tag completed successfully');
    } catch (error) {
        error('❌ Error in editTag:', error);
    }
}

// File upload
// Image compression utility
async function compressImage(base64: string, maxWidth = 1024, quality = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    // Calculate new dimensions
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }

                    // Create canvas and compress
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }

                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to compressed base64
                    const compressed = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressed);
                } catch (e) {
                    reject(e);
                }
            };

            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };

            img.src = base64;
        } catch (e) {
            reject(e);
        }
    });
}

function handleFileUpload(e: Event) {
    if (!state.activeChannelId) {
        showErrorNotification('No channel selected. Please select a channel first.');
        return;
    }

    const input = e.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) return;

    const channel = state.channels.find(c => c.id === state.activeChannelId);
    if (!channel) {
        showErrorNotification('Channel not found. Please try again.');
        return;
    }

    const fileCount = files.length;
    const fileWord = fileCount === 1 ? 'image' : 'images';

    // Validate file types
    const invalidFiles = Array.from(files).filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
        showErrorNotification(`Please select only image files. ${invalidFiles.length} invalid file(s) detected.`);
        input.value = '';
        return;
    }

    // Show loading overlay
    showLoadingOverlay(`Uploading ${fileCount} ${fileWord}...`);

    let processedCount = 0;
    let errorCount = 0;

    Array.from(files).forEach(async file => {
        const reader = new FileReader();

        reader.onerror = () => {
            errorCount++;
            processedCount++;
            error('Failed to read file:', file.name);

            if (processedCount === fileCount) {
                hideLoadingOverlay();
                if (errorCount > 0) {
                    showErrorNotification(`Failed to upload ${errorCount} ${errorCount === 1 ? 'image' : 'images'}. Please try again.`);
                }
                if (processedCount - errorCount > 0) {
                    showSuccessNotification(`Successfully uploaded ${processedCount - errorCount} ${processedCount - errorCount === 1 ? 'image' : 'images'}.`);
                    saveToStorage();
                    renderGallery(channel);
                    renderChannelsList();
                }
            }
        };

        reader.onload = async (event) => {
            try {
                const result = event.target?.result as string;

                if (!result) {
                    throw new Error('Failed to read file data');
                }

                // Compress image before storing
                const compressed = await compressImage(result);
                const originalSize = (result.length * 0.75 / 1024).toFixed(0);
                const compressedSize = (compressed.length * 0.75 / 1024).toFixed(0);
                log(`📦 Image compressed: ${originalSize}KB → ${compressedSize}KB (${((1 - compressed.length / result.length) * 100).toFixed(0)}% reduction)`);

                channel.images.push(compressed);
                processedCount++;

                // Update loading text
                const overlay = document.getElementById('loadingOverlay');
                const textElement = overlay?.querySelector('.loading-text');
                if (textElement) {
                    textElement.textContent = `Processing ${processedCount}/${fileCount} ${fileWord}...`;
                }

                // If all files processed, save and hide loading
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
            } catch (e) {
                errorCount++;
                processedCount++;
                error('Failed to process image:', e);

                if (processedCount === fileCount) {
                    hideLoadingOverlay();
                    if (errorCount > 0) {
                        showErrorNotification(`Failed to process ${errorCount} ${errorCount === 1 ? 'image' : 'images'}. Please try again.`);
                    }
                    if (processedCount - errorCount > 0) {
                        showSuccessNotification(`Successfully uploaded ${processedCount - errorCount} ${processedCount - errorCount === 1 ? 'image' : 'images'}.`);
                        saveToStorage();
                        renderGallery(channel);
                        renderChannelsList();
                    }
                }
            }
        };

        reader.readAsDataURL(file);
    });

    input.value = '';
}

// Settings functions
function openSettingsModal() {
    // Reset Danbooru tags page to 0 when opening settings
    danbooruTagsPage = 0;

    // Update stats
    const channelCountEl = document.getElementById('channelCount');
    const tagCountEl = document.getElementById('tagCount');
    const danbooruTagCountEl = document.getElementById('danbooruTagCount');

    if (channelCountEl) {
        channelCountEl.textContent = state.channels.length.toString();
    }

    if (tagCountEl) {
        tagCountEl.textContent = state.tags.length.toString();
    }

    if (danbooruTagCountEl) {
        danbooruTagCountEl.textContent = customDanbooruTags.length.toString();
    }

    // Reorder theme options to show active theme first
    const themeSelector = document.querySelector('.theme-selector')!;
    const themeOptions = Array.from(themeSelector.querySelectorAll('.theme-option'));

    // Sort so active theme comes first
    themeOptions.sort((a, b) => {
        const aActive = a.classList.contains('active') ? 0 : 1;
        const bActive = b.classList.contains('active') ? 0 : 1;
        return aActive - bActive;
    });

    // Clear and re-append in new order
    themeSelector.innerHTML = '';
    themeOptions.forEach(option => themeSelector.appendChild(option));

    // Show modal first, then render tags (feels faster)
    document.getElementById('settingsModal')!.classList.add('active');

    // Render Danbooru tags with a small delay to let modal open smoothly
    setTimeout(() => {
        renderDanbooruTags();
    }, 50);
}

function closeSettingsModal() {
    document.getElementById('settingsModal')!.classList.remove('active');
}

function openGalleryModal() {
    log('🚀 Opening gallery modal...');

    // Check if there are any images across all channels
    const totalImages = state.channels.reduce((count, channel) => count + channel.images.length, 0);

    if (totalImages === 0) {
        log('⚠️ Cannot open gallery - no images available');
        showErrorNotification('No images in gallery yet. Upload some images first!');
        return;
    }

    // Close any other open modals first (especially image modal)
    const imageModal = document.getElementById('imageModal');
    if (imageModal?.classList.contains('active')) {
        log('⚠️ Closing image modal first');
        closeImageModal();
    }

    // Open modal first
    const modal = document.getElementById('galleryModal');
    if (modal) {
        modal.classList.add('active');

        // Apply theme-appropriate background
        const modalContent = modal.querySelector('.modal-content') as HTMLElement;
        if (modalContent) {
            if (Theme.isOLED()) {
                modalContent.style.background = 'linear-gradient(135deg, #000000 0%, #0a0a0a 50%, #000000 100%)';
                log('✅ OLED gradient background applied');
            } else {
                // Remove inline background to use CSS theme
                modalContent.style.background = '';
                log('✅ Using CSS theme background');
            }
        }

        log('✅ Gallery modal opened');

        // Render gallery after modal is visible
        setTimeout(() => {
            renderGalleryGrid();
        }, 50);
    } else {
        error('❌ Gallery modal element not found');
    }
}

function closeGalleryModal() {
    document.getElementById('galleryModal')!.classList.remove('active');
}

// Helper function to collect all images from all channels
function collectImagesFromChannels(): { src: string; channelId: string; channelName: string; timestamp: number }[] {
    const allImages: { src: string; channelId: string; channelName: string; timestamp: number }[] = [];

    state.channels.forEach(channel => {
        log(`📁 Channel "${channel.name}": ${channel.images.length} images`);
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

    log('🎨 Total images collected:', allImages.length);
    log('🔍 First few images:', allImages.slice(0, 3));

    // Sort by timestamp descending (newest first)
    // Since newer images are added to the end of the array, we reverse
    allImages.reverse();

    return allImages;
}

// Helper function to render empty gallery state
function renderGalleryEmptyState(container: HTMLElement): void {
    log('ℹ️ No images to display, showing empty state');
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

// Helper function to escape HTML attributes
function escapeHtmlAttribute(str: string): string {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper function to create gallery grid item HTML
function createGalleryGridItemHTML(image: { src: string; channelId: string; channelName: string }, itemBg: string): string {
    // Safely escape all attribute values to prevent HTML injection
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
    log('🖼️ renderGalleryGrid() called');

    const galleryGrid = document.getElementById('allGalleryGrid');
    log('📦 Gallery grid element:', galleryGrid);

    if (!galleryGrid) {
        error('❌ All gallery grid element not found');
        return;
    }

    // Force grid styles via JavaScript
    // Smaller thumbnails (110px) to fit 7 per row
    galleryGrid.style.display = 'grid';
    galleryGrid.style.gridTemplateColumns = 'repeat(auto-fill, 110px)';
    galleryGrid.style.gridAutoFlow = 'row dense';
    galleryGrid.style.gridAutoRows = 'min-content';
    galleryGrid.style.gap = '10px';
    galleryGrid.style.padding = '24px';
    galleryGrid.style.maxHeight = 'calc(90vh - 100px)';
    galleryGrid.style.overflowY = 'auto';
    galleryGrid.style.justifyContent = 'center';
    galleryGrid.style.alignContent = 'start';
    galleryGrid.style.background = 'transparent';
    galleryGrid.style.border = 'none';
    galleryGrid.style.boxShadow = 'none';
    galleryGrid.style.minHeight = 'auto';
    galleryGrid.style.width = '100%';
    log('✅ Gallery grid inline styles applied (110px thumbnails for 7 per row)');

    log('📊 Total channels:', state.channels.length);

    // Collect all images from all channels with metadata
    const allImages = collectImagesFromChannels();

    // Render gallery
    if (allImages.length === 0) {
        renderGalleryEmptyState(galleryGrid);
        return;
    }

    log('✅ Rendering', allImages.length, 'images in gallery grid');

    try {
        // Get current theme for item backgrounds
        const itemBg = Theme.isOLED() ? '#0a0a0a' : '#F5F5F5';

        const htmlContent = allImages.map(image => createGalleryGridItemHTML(image, itemBg)).join('');

        log('📝 Generated HTML length:', htmlContent.length);
        log('🎨 Using 110px thumbnails for 7 per row');

        // Safely set innerHTML with error handling
        galleryGrid.innerHTML = htmlContent;

        log('✅ Gallery grid HTML rendered');
        log('🔢 Gallery grid children count:', galleryGrid.children.length);

        // Check computed styles
        const computedStyle = window.getComputedStyle(galleryGrid);
        log('🎨 Gallery grid computed styles:');
        log('  - grid-template-columns:', computedStyle.gridTemplateColumns);
        log('  - gap:', computedStyle.gap);
        log('  - width:', computedStyle.width);
        log('  - height:', computedStyle.height);

        // Check first item size and styling
        const firstItem = galleryGrid.querySelector('.gallery-grid-item') as HTMLElement;
        if (firstItem) {
            const itemStyle = window.getComputedStyle(firstItem);
            const itemRect = firstItem.getBoundingClientRect();
            log('📐 First gallery item:');
            log('  - computed width:', itemStyle.width);
            log('  - computed height:', itemStyle.height);
            log('  - actual rendered width:', itemRect.width + 'px');
            log('  - actual rendered height:', itemRect.height + 'px');
            log('  - border:', itemStyle.border);
            log('  - border-color:', itemStyle.borderColor);
            log('  - box-shadow:', itemStyle.boxShadow);
            log('  - background:', itemStyle.background);
            log('  - border-radius:', itemStyle.borderRadius);
        }

        // Event delegation is now handled globally - no need for individual listeners
        log('✅ Gallery grid rendered - using global event delegation for clicks');
    } catch (e) {
        error('❌ Failed to render gallery grid:', e);
        showErrorNotification('Failed to render gallery. Please refresh the page.');
        // Fallback to empty state
        renderGalleryEmptyState(galleryGrid);
    }
}

function openDanbooruTagManagerModal() {
    // Reset Danbooru tags page and search query when opening
    danbooruTagsPage = 0;
    danbooruSearchQuery = '';

    // Clear search input
    const searchInput = document.getElementById('danbooruSearchInput') as HTMLInputElement;
    const clearBtn = document.getElementById('clearDanbooruSearchBtn');
    if (searchInput) {
        searchInput.value = '';
    }
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }

    // Render tags
    renderDanbooruTags();

    // Open modal
    document.getElementById('danbooruTagManagerModal')!.classList.add('active');
}

function closeDanbooruTagManagerModal() {
    document.getElementById('danbooruTagManagerModal')!.classList.remove('active');
}

function exportData() {
    try {
        // Check if there's any data to export
        const hasData = state.channels.length > 0 || state.tags.length > 0 || customDanbooruTags.length > 0;

        if (!hasData) {
            const btn = document.getElementById('exportDataBtn');
            if (btn) {
                shakeElement(btn as HTMLElement);
            }
            showErrorNotification('No data to export. Create some channels or tags first.');
            return;
        }

        const data = {
            channels: state.channels,
            tags: state.tags,
            customDanbooruTags: customDanbooruTags,
            version: '1.0.0',
            exportedAt: new Date().toISOString()
        };

        const jsonString = JSON.stringify(data, null, 2);

        // Create backdrop for depth of field
        const backdrop = document.createElement('div');
        backdrop.style.position = 'fixed';
        backdrop.style.top = '0';
        backdrop.style.left = '0';
        backdrop.style.width = '100%';
        backdrop.style.height = '100%';
        backdrop.style.background = 'rgba(0, 0, 0, 0.6)';
        backdrop.style.backdropFilter = 'blur(4px)';
        backdrop.style.zIndex = '2999';
        document.body.appendChild(backdrop);

        // Create a text area with the JSON data for manual copying
        const textArea = document.createElement('textarea');
        textArea.value = jsonString;
        textArea.style.position = 'fixed';
        textArea.style.top = '50%';
        textArea.style.left = '50%';
        textArea.style.transform = 'translate(-50%, -50%)';
        textArea.style.width = '80%';
        textArea.style.height = '60%';
        textArea.style.padding = '20px';
        textArea.style.background = '#1a0a0a';
        textArea.style.color = '#f4e8d8';
        textArea.style.border = '2px solid var(--silver)';
        textArea.style.borderRadius = '12px';
        textArea.style.fontSize = '14px';
        textArea.style.fontFamily = 'monospace';
    textArea.style.zIndex = '3000';
    textArea.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5), 0 16px 64px rgba(0, 0, 0, 0.4)';
    textArea.readOnly = true;

    document.body.appendChild(textArea);
    textArea.select();

    // Create a close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.position = 'fixed';
    closeBtn.style.top = 'calc(50% + 32%)';
    closeBtn.style.left = '50%';
    closeBtn.style.transform = 'translateX(-50%)';
    closeBtn.style.padding = '10px 24px';
    closeBtn.style.background = 'var(--reddish-brown)';
    closeBtn.style.color = 'var(--cream)';
    closeBtn.style.border = '1px solid var(--silver)';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.zIndex = '3001';
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

    // Use universal copy function
    copyToClipboard(jsonString).then(success => {
        if (success) {
            // Show success message
            const message = document.createElement('div');
            message.textContent = '✓ Data copied to clipboard! Save it as a .json file.';
            message.style.position = 'fixed';
            message.style.top = '20px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.background = '#34c759';
            message.style.color = 'white';
            message.style.padding = '12px 24px';
            message.style.borderRadius = '8px';
            message.style.fontWeight = '600';
            message.style.zIndex = '3001';
            message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            document.body.appendChild(message);

            setTimeout(() => {
                if (document.body.contains(message)) {
                    document.body.removeChild(message);
                }
            }, 3000);
        } else {
            error('Copy failed - textarea remains open for manual copy');
            showErrorNotification('Failed to copy to clipboard. Please copy manually from the text area.');
        }
    });
    } catch (e) {
        error('Failed to export data:', e);
        showErrorNotification('Failed to export data. Please try again.');
    }
}

// Export individual channel
function exportChannel(channelId: string) {
    const channel = state.channels.find(c => c.id === channelId);
    if (!channel) {
        error('Channel not found for export');
        return;
    }

    log('Exporting channel:', channel.name);

    const data = {
        channel: channel,
        version: '1.0.0',
        exportedAt: new Date().toISOString()
    };

    const jsonString = JSON.stringify(data, null, 2);
    const filename = `${channel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_channel.json`;

    // Create a text area with the JSON data for manual copying (same as Export All Data)
    const textArea = document.createElement('textarea');
    textArea.value = jsonString;
    textArea.style.position = 'fixed';
    textArea.style.top = '50%';
    textArea.style.left = '50%';
    textArea.style.transform = 'translate(-50%, -50%)';
    textArea.style.width = '80%';
    textArea.style.height = '60%';
    textArea.style.padding = '20px';
    textArea.style.background = '#1a0a0a';
    textArea.style.color = '#f4e8d8';
    textArea.style.border = '2px solid var(--silver)';
    textArea.style.borderRadius = '12px';
    textArea.style.fontSize = '14px';
    textArea.style.fontFamily = 'monospace';
    textArea.style.zIndex = '3000';
    textArea.readOnly = true;

    document.body.appendChild(textArea);
    textArea.select();

    // Use universal copy function
    copyToClipboard(jsonString).then(success => {
        if (success) {
            // Show success message
            const message = document.createElement('div');
            message.textContent = `✓ Channel "${channel.name}" data copied to clipboard! Save it as ${filename}`;
            message.style.position = 'fixed';
            message.style.top = '20px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.background = '#34c759';
            message.style.color = 'white';
            message.style.padding = '12px 24px';
            message.style.borderRadius = '8px';
            message.style.fontWeight = '600';
            message.style.zIndex = '3001';
            message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            document.body.appendChild(message);

            setTimeout(() => {
                document.body.removeChild(message);
                document.body.removeChild(textArea);
            }, 3000);
        } else {
            error('Copy failed');
            // Leave the textarea visible for manual copying
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.position = 'fixed';
            closeBtn.style.top = 'calc(50% + 32%)';
            closeBtn.style.left = '50%';
            closeBtn.style.transform = 'translateX(-50%)';
            closeBtn.style.padding = '10px 24px';
            closeBtn.style.background = 'var(--reddish-brown)';
            closeBtn.style.color = 'var(--cream)';
            closeBtn.style.border = '1px solid var(--silver)';
            closeBtn.style.borderRadius = '6px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.zIndex = '3001';
            closeBtn.onclick = () => {
                document.body.removeChild(textArea);
                document.body.removeChild(closeBtn);
            };
            document.body.appendChild(closeBtn);
        }
    });
}

function importData(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
        showErrorNotification('Please select a valid JSON file.');
        input.value = '';
        return;
    }

    showLoadingOverlay('Importing data...');

    const reader = new FileReader();

    reader.onerror = () => {
        hideLoadingOverlay();
        error('Failed to read import file');
        showErrorNotification('Failed to read file. Please try again.');
        input.value = '';
    };

    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target?.result as string);

            // Validate data structure
            if (!data.channels || !Array.isArray(data.channels)) {
                hideLoadingOverlay();
                showErrorNotification('Invalid backup file: missing or invalid channels data.');
                input.value = '';
                return;
            }

            if (!data.tags || !Array.isArray(data.tags)) {
                hideLoadingOverlay();
                showErrorNotification('Invalid backup file: missing or invalid tags data.');
                input.value = '';
                return;
            }

            // Import data
            state.channels = data.channels;
            state.tags = data.tags;
            state.activeChannelId = null;
            state.activeFilter = 'all';
            state.activeFilters = [];

            // Import custom Danbooru tags if present
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
            error('Failed to import data:', err);
            showErrorNotification('Failed to import data. Please check the file format.');
        }
    };

    reader.readAsText(file);
    input.value = '';
}

async function clearAllData() {
    // Check if there's any data to clear
    const hasData = state.channels.length > 0 || state.tags.length > 0 || customDanbooruTags.length > 0;

    if (!hasData) {
        const btn = document.getElementById('clearDataBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    const confirmClear = await customConfirm(t('confirmClearData'));

    if (confirmClear) {
        state.channels = [];
        state.tags = [];
        state.activeChannelId = null;
        state.activeFilter = 'all';
        customDanbooruTags = [];

        saveToStorage();
        renderChannelsList();
        renderFilterTags();
        showEmptyState();
        closeSettingsModal();

        alert('All data has been cleared.');
    }
}

// Custom Emoji Font Functions
async function handleEmojiFontUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.ttf') && !file.name.endsWith('.otf')) {
        alert('Please upload a .ttf or .otf font file');
        return;
    }

    // Check file size (warn if > 20MB)
    if (file.size > 20 * 1024 * 1024) {
        const proceed = await customConfirm('This font file is large (' + Math.round(file.size / 1024 / 1024) + 'MB). Continue?', 'Continue', 'Cancel');
        if (!proceed) return;
    }

    try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Font = e.target?.result as string;

            // Store in storage
            await storageSet('customEmojiFont', base64Font);
            await storageSet('customEmojiFontName', file.name);

            // Apply the font
            applyCustomEmojiFont(base64Font);

            // Update UI
            const statusEl = document.getElementById('emojiFontStatus');
            if (statusEl) statusEl.textContent = `✓ Using: ${file.name}`;

            const resetBtn = document.getElementById('resetEmojiFontBtn') as HTMLButtonElement;
            if (resetBtn) resetBtn.style.display = 'inline-block';
        };

        reader.readAsDataURL(file);
    } catch (error) {
        error('Failed to upload emoji font:', error);
        alert('Failed to upload font file');
    }
}

function applyCustomEmojiFont(base64Font: string) {
    log('🎨 Applying custom emoji font...');

    // Remove existing custom emoji font
    const existingStyle = document.getElementById('custom-emoji-font');
    if (existingStyle) {
        log('🗑️ Removing existing custom emoji font style');
        existingStyle.remove();
    }

    // Create new style element with @font-face
    const style = document.createElement('style');
    style.id = 'custom-emoji-font';
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
    log('✅ Custom emoji font style injected into DOM');

    // Check title element
    const titleElement = document.querySelector('.top-bar-title');
    if (titleElement) {
        const computedStyle = window.getComputedStyle(titleElement);
        log('🔍 Title element found');
        log('📝 Title computed font-family:', computedStyle.fontFamily);
        log('📝 Title font-size:', computedStyle.fontSize);
        log('📝 Title font-weight:', computedStyle.fontWeight);
    } else {
        log('❌ Title element (.top-bar-title) not found!');
    }
}

async function resetEmojiFont() {
    // Remove custom font from storage
    localStorage.removeItem('serpentsBook_customEmojiFont');
    localStorage.removeItem('serpentsBook_customEmojiFontName');

    // Remove custom font style
    const existingStyle = document.getElementById('custom-emoji-font');
    if (existingStyle) existingStyle.remove();

    // Update UI
    const statusEl = document.getElementById('emojiFontStatus');
    if (statusEl) statusEl.textContent = '';

    const resetBtn = document.getElementById('resetEmojiFontBtn') as HTMLButtonElement;
    if (resetBtn) resetBtn.style.display = 'none';

    alert('Reset to default emoji font');
}

async function loadCustomEmojiFont() {
    const fontData = await storageGet('customEmojiFont');
    const fontName = await storageGet('customEmojiFontName');

    if (fontData) {
        applyCustomEmojiFont(fontData);

        // Update UI
        const statusEl = document.getElementById('emojiFontStatus');
        if (statusEl && fontName) statusEl.textContent = `✓ Using: ${fontName}`;

        const resetBtn = document.getElementById('resetEmojiFontBtn') as HTMLButtonElement;
        if (resetBtn) resetBtn.style.display = 'inline-block';
    }
}

// Emoji Variant Context Menu
const emojiVariants: { [key: string]: string[] } = {
    '👍': ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'],
    '👎': ['👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿'],
    '✌': ['✌', '✌🏻', '✌🏼', '✌🏽', '✌🏾', '✌🏿'],
    '✊': ['✊', '✊🏻', '✊🏼', '✊🏽', '✊🏾', '✊🏿'],
    '✋': ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'],
    '👋': ['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿'],
    '🤚': ['🤚', '🤚🏻', '🤚🏼', '🤚🏽', '🤚🏾', '🤚🏿'],
    '🖐': ['🖐', '🖐🏻', '🖐🏼', '🖐🏽', '🖐🏾', '🖐🏿'],
    '✍': ['✍', '✍🏻', '✍🏼', '✍🏽', '✍🏾', '✍🏿'],
    '🙏': ['🙏', '🙏🏻', '🙏🏼', '🙏🏽', '🙏🏾', '🙏🏿'],
    '💪': ['💪', '💪🏻', '💪🏼', '💪🏽', '💪🏾', '💪🏿'],
    '👂': ['👂', '👂🏻', '👂🏼', '👂🏽', '👂🏾', '👂🏿'],
    '👃': ['👃', '👃🏻', '👃🏼', '👃🏽', '👃🏾', '👃🏿'],
    '🤳': ['🤳', '🤳🏻', '🤳🏼', '🤳🏽', '🤳🏾', '🤳🏿'],
    '💅': ['💅', '💅🏻', '💅🏼', '💅🏽', '💅🏾', '💅🏿'],
    '🤙': ['🤙', '🤙🏻', '🤙🏼', '🤙🏽', '🤙🏾', '🤙🏿'],
    '👶': ['👶', '👶🏻', '👶🏼', '👶🏽', '👶🏾', '👶🏿'],
    '👦': ['👦', '👦🏻', '👦🏼', '👦🏽', '👦🏾', '👦🏿'],
    '👧': ['👧', '👧🏻', '👧🏼', '👧🏽', '👧🏾', '👧🏿'],
    '👨': ['👨', '👨🏻', '👨🏼', '👨🏽', '👨🏾', '👨🏿'],
    '👩': ['👩', '👩🏻', '👩🏼', '👩🏽', '👩🏾', '👩🏿'],
    '🙂': ['🙂', '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂'],
    '😊': ['😊', '😇', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗'],
    '😎': ['😎', '🤓', '🧐', '😏', '😒', '😞', '😔', '😟', '😕'],
    '😐': ['😐', '😑', '😶', '🙄', '😬', '🤐', '😯', '😦', '😧'],
    '❤': ['❤', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎'],
};

let emojiVariantMenuActive = false;
let currentEmojiTarget: HTMLElement | null = null;

function showEmojiVariantMenu(emoji: string, x: number, y: number, targetElement: HTMLElement) {
    const menu = document.getElementById('emojiVariantMenu');
    const grid = document.getElementById('emojiVariantGrid');

    if (!menu || !grid) return;

    // Get variants for this emoji
    const variants = emojiVariants[emoji];
    if (!variants || variants.length <= 1) {
        // Shake the target element to indicate no variants
        shakeElement(targetElement);
        hideEmojiVariantMenu();
        return;
    }

    // Clear previous variants
    grid.innerHTML = '';

    // Add variant items
    variants.forEach(variant => {
        const item = document.createElement('div');
        item.className = 'emoji-variant-item';
        item.textContent = variant;
        item.addEventListener('click', () => {
            replaceEmojiWithVariant(targetElement, emoji, variant);
            hideEmojiVariantMenu();
        });
        grid.appendChild(item);
    });

    // Position the menu relative to the emoji position (x, y coordinates)
    log('📍 Emoji coordinates:', x, y);
    log('📍 Window size:', window.innerWidth, 'x', window.innerHeight);

    const menuWidth = 320; // max-width from CSS
    const menuHeight = 200; // estimated height
    const gap = 8;

    // Position menu directly below the emoji character
    let left = x - (menuWidth / 2); // Center horizontally on emoji
    let top = y + 32; // Position below emoji (assuming ~32px line height)

    log('📍 Initial emoji-aligned position: left =', left, ', top =', top);

    // Keep menu on screen horizontally
    if (left < gap) {
        left = gap;
        log('📍 Adjusted for left edge: left =', left);
    } else if (left + menuWidth > window.innerWidth - gap) {
        left = window.innerWidth - menuWidth - gap;
        log('📍 Adjusted for right edge: left =', left);
    }

    // If menu would go off bottom, show above emoji instead
    if (top + menuHeight > window.innerHeight - gap) {
        top = y - menuHeight - gap;
        log('📍 Adjusted for bottom edge (showing above): top =', top);

        // If also off top, just position at top with gap
        if (top < gap) {
            top = gap;
            log('📍 Adjusted for top edge: top =', top);
        }
    }

    log('📍 Final position: left =', left, ', top =', top);

    // Show backdrop
    const backdrop = document.getElementById('emojiVariantBackdrop');
    if (backdrop) backdrop.style.display = 'block';

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block';

    emojiVariantMenuActive = true;
    currentEmojiTarget = targetElement;
}

// Version with callback for custom behavior (used in emoji picker)
function showEmojiVariantMenuWithCallback(emoji: string, targetElement: HTMLElement, callback: (variant: string) => void) {
    const menu = document.getElementById('emojiVariantMenu');
    const grid = document.getElementById('emojiVariantGrid');

    if (!menu || !grid) return;

    // Get variants for this emoji
    const variants = emojiVariants[emoji];
    if (!variants || variants.length <= 1) {
        hideEmojiVariantMenu();
        return;
    }

    // Clear previous variants
    grid.innerHTML = '';

    // Add variant items with custom callback
    variants.forEach(variant => {
        const item = document.createElement('div');
        item.className = 'emoji-variant-item';
        item.textContent = variant;
        item.addEventListener('click', () => {
            callback(variant);
        });
        grid.appendChild(item);
    });

    // Position the menu relative to the target element (emoji button)
    const rect = targetElement.getBoundingClientRect();
    log('📍 [Picker] Target element rect:', rect);
    log('📍 [Picker] Window size:', window.innerWidth, 'x', window.innerHeight);

    const menuWidth = 320; // max-width from CSS
    const menuHeight = 200; // estimated height
    const gap = 8;

    // Center the menu horizontally on the emoji button
    let left = rect.left + (rect.width / 2) - (menuWidth / 2);
    let top = rect.bottom + gap;

    log('📍 [Picker] Initial centered position: left =', left, ', top =', top);

    // Keep menu on screen horizontally
    if (left < gap) {
        left = gap;
        log('📍 [Picker] Adjusted for left edge: left =', left);
    } else if (left + menuWidth > window.innerWidth - gap) {
        left = window.innerWidth - menuWidth - gap;
        log('📍 [Picker] Adjusted for right edge: left =', left);
    }

    // If menu would go off bottom, show above element instead
    if (top + menuHeight > window.innerHeight - gap) {
        top = rect.top - menuHeight - gap;
        log('📍 [Picker] Adjusted for bottom edge (showing above): top =', top);

        // If also off top, just position at top with gap
        if (top < gap) {
            top = gap;
            log('📍 [Picker] Adjusted for top edge: top =', top);
        }
    }

    log('📍 [Picker] Final position: left =', left, ', top =', top);

    // Show backdrop
    const backdrop = document.getElementById('emojiVariantBackdrop');
    if (backdrop) backdrop.style.display = 'block';

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block';

    emojiVariantMenuActive = true;
}

function hideEmojiVariantMenu() {
    const menu = document.getElementById('emojiVariantMenu');
    const backdrop = document.getElementById('emojiVariantBackdrop');

    if (menu) {
        menu.style.display = 'none';
    }
    if (backdrop) {
        backdrop.style.display = 'none';
    }

    emojiVariantMenuActive = false;
    currentEmojiTarget = null;
}

// Universal copy to clipboard function with fallback
async function copyToClipboard(text: string): Promise<boolean> {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            warn('Clipboard API failed, falling back to textarea method:', err);
        }
    }

    // Fallback: Use textarea selection method
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        document.body.removeChild(textArea);
        error('All copy methods failed:', err);
        return false;
    }
}

function shakeElement(element: HTMLElement) {
    // Add shake class
    element.classList.add('shake-animation');

    // Remove class after animation completes
    setTimeout(() => {
        element.classList.remove('shake-animation');
    }, 500);
}

// Version for emoji picker - perfectly aligned under the emoji button
function showEmojiVariantMenuUnderElement(emoji: string, element: HTMLElement, callback: (variant: string) => void) {
    const menu = document.getElementById('emojiVariantMenu');
    const grid = document.getElementById('emojiVariantGrid');

    if (!menu || !grid) return;

    // Get variants for this emoji
    const variants = emojiVariants[emoji];
    if (!variants || variants.length <= 1) {
        hideEmojiVariantMenu();
        return;
    }

    // Clear previous variants
    grid.innerHTML = '';

    // Add variant items with custom callback
    variants.forEach(variant => {
        const item = document.createElement('div');
        item.className = 'emoji-variant-item';
        item.textContent = variant;
        item.addEventListener('click', () => {
            callback(variant);
        });
        grid.appendChild(item);
    });

    // Temporarily show menu off-screen to measure its actual size
    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    menu.style.display = 'block';

    // Get actual rendered dimensions
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;

    // Hide it again before repositioning
    menu.style.display = 'none';

    // Get the emoji button's exact position
    const rect = element.getBoundingClientRect();
    log('📍 [Aligned] Emoji button rect:', rect);
    log('📍 [Aligned] Window size:', window.innerWidth, 'x', window.innerHeight);
    log('📍 [Aligned] Actual menu size:', menuWidth, 'x', menuHeight);

    const gap = 4; // Small gap for tight alignment

    let left: number;
    let top = rect.bottom + gap;

    // Check if menu would fit on the right side of the button
    const spaceOnRight = window.innerWidth - rect.left;
    // Check if menu would fit on the left side of the button (right-aligned)
    const spaceOnLeft = rect.right;

    log('📍 [Aligned] Space on right:', spaceOnRight);
    log('📍 [Aligned] Space on left:', spaceOnLeft);

    // Decide alignment based on available space and emoji position
    const emojiCenter = rect.left + (rect.width / 2);
    const windowCenter = window.innerWidth / 2;
    const distanceFromCenter = Math.abs(emojiCenter - windowCenter);
    const isNearEdge = distanceFromCenter > (window.innerWidth * 0.3); // 30% from center = near edge

    log('📍 [Aligned] Emoji center:', emojiCenter, 'Window center:', windowCenter);
    log('📍 [Aligned] Distance from center:', distanceFromCenter, 'Near edge?', isNearEdge);

    if (spaceOnRight >= menuWidth + gap && spaceOnLeft >= menuWidth + gap && !isNearEdge) {
        // Emoji is in center area with space on both sides: center menu under emoji
        left = emojiCenter - (menuWidth / 2);
        log('📍 [Aligned] Center area: centering menu under emoji');
    } else if (spaceOnRight >= menuWidth + gap) {
        // Enough space on right: align menu's left edge with button's left edge
        left = rect.left;
        log('📍 [Aligned] Aligning left edge of menu with left edge of button');
    } else if (spaceOnLeft >= menuWidth + gap) {
        // Not enough space on right, but enough on left: align menu's right edge with button's right edge
        left = rect.right - menuWidth;
        log('📍 [Aligned] Aligning right edge of menu with right edge of button');
    } else {
        // Not enough space either way: center the menu on the button and let edge detection handle it
        left = rect.left + (rect.width / 2) - (menuWidth / 2);
        log('📍 [Aligned] Not enough space, centering menu on button');
    }

    log('📍 [Aligned] Initial smart position: left =', left, ', top =', top);

    // Keep menu on screen horizontally (as fallback)
    if (left < gap) {
        left = gap;
        log('📍 [Aligned] Adjusted for left edge: left =', left);
    } else if (left + menuWidth > window.innerWidth - gap) {
        left = window.innerWidth - menuWidth - gap;
        log('📍 [Aligned] Adjusted for right edge: left =', left);
    }

    // Vertical positioning with smart overflow handling
    if (top + menuHeight > window.innerHeight - gap) {
        // Try showing above emoji first
        const topAbove = rect.top - menuHeight - gap;

        if (topAbove >= gap) {
            // Enough space above, use it
            top = topAbove;
            log('📍 [Aligned] Not enough space below, showing above: top =', top);
        } else {
            // Not enough space above either, pin to bottom of screen
            top = window.innerHeight - menuHeight - gap;
            log('📍 [Aligned] Not enough space above or below, pinning to bottom: top =', top);

            // If menu is still too tall, pin to top instead
            if (top < gap) {
                top = gap;
                log('📍 [Aligned] Menu too tall, pinning to top: top =', top);
            }
        }
    }

    log('📍 [Aligned] Final position: left =', left, ', top =', top);

    // Show backdrop
    const backdrop = document.getElementById('emojiVariantBackdrop');
    if (backdrop) backdrop.style.display = 'block';

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block';

    emojiVariantMenuActive = true;
}

// Version for mouse position (legacy - not currently used)
function showEmojiVariantMenuAtPosition(emoji: string, x: number, y: number, callback: (variant: string) => void) {
    const menu = document.getElementById('emojiVariantMenu');
    const grid = document.getElementById('emojiVariantGrid');

    if (!menu || !grid) return;

    // Get variants for this emoji
    const variants = emojiVariants[emoji];
    if (!variants || variants.length <= 1) {
        hideEmojiVariantMenu();
        return;
    }

    // Clear previous variants
    grid.innerHTML = '';

    // Add variant items with custom callback
    variants.forEach(variant => {
        const item = document.createElement('div');
        item.className = 'emoji-variant-item';
        item.textContent = variant;
        item.addEventListener('click', () => {
            callback(variant);
        });
        grid.appendChild(item);
    });

    // Position the menu at mouse position
    log('📍 [Mouse] Mouse position:', x, y);
    log('📍 [Mouse] Window size:', window.innerWidth, 'x', window.innerHeight);

    const menuWidth = 320; // max-width from CSS
    const menuHeight = 200; // estimated height
    const gap = 8;

    // Position menu directly below mouse click, centered on it
    let left = x - (menuWidth / 2);
    let top = y + gap;

    log('📍 [Mouse] Initial position below cursor: left =', left, ', top =', top);

    // Keep menu on screen horizontally
    if (left < gap) {
        left = gap;
        log('📍 [Mouse] Adjusted for left edge: left =', left);
    } else if (left + menuWidth > window.innerWidth - gap) {
        left = window.innerWidth - menuWidth - gap;
        log('📍 [Mouse] Adjusted for right edge: left =', left);
    }

    // If menu would go off bottom, show above cursor instead
    if (top + menuHeight > window.innerHeight - gap) {
        top = y - menuHeight - gap;
        log('📍 [Mouse] Adjusted for bottom edge (showing above): top =', top);

        // If also off top, just position at top with gap
        if (top < gap) {
            top = gap;
            log('📍 [Mouse] Adjusted for top edge: top =', top);
        }
    }

    log('📍 [Mouse] Final position: left =', left, ', top =', top);

    // Show backdrop
    const backdrop = document.getElementById('emojiVariantBackdrop');
    if (backdrop) backdrop.style.display = 'block';

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block';

    emojiVariantMenuActive = true;
}

function replaceEmojiWithVariant(element: HTMLElement, oldEmoji: string, newEmoji: string) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const text = element.value;
        const cursorPos = element.selectionStart || 0;

        // Find emoji at cursor position
        const before = text.substring(0, cursorPos);
        const after = text.substring(cursorPos);

        // Replace the last occurrence of the emoji before cursor
        const lastIndex = before.lastIndexOf(oldEmoji);
        if (lastIndex !== -1) {
            element.value = before.substring(0, lastIndex) + newEmoji + before.substring(lastIndex + oldEmoji.length) + after;
            element.selectionStart = element.selectionEnd = lastIndex + newEmoji.length;
        }
    } else {
        // For other elements, replace text content
        element.textContent = element.textContent?.replace(oldEmoji, newEmoji) || '';
    }
}

function getEmojiAtPosition(text: string, position: number): string | null {
    // Convert to array of actual characters (handles multi-byte emojis properly)
    const chars = Array.from(text);
    let charPos = 0;
    let utf16Pos = 0;

    // Find character position from UTF-16 position
    while (utf16Pos < position && charPos < chars.length) {
        utf16Pos += chars[charPos].length;
        charPos++;
    }

    // Check several characters before cursor
    for (let lookback = 0; lookback <= 3; lookback++) {
        const checkPos = charPos - lookback - 1;
        if (checkPos < 0) break;

        const emoji = chars[checkPos];

        // Check if this is a known emoji with variants
        if (emojiVariants[emoji]) {
            return emoji;
        }

        // Also check base emoji without skin tone modifiers
        const baseEmoji = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
        if (baseEmoji !== emoji && emojiVariants[baseEmoji]) {
            return baseEmoji;
        }
    }

    return null;
}

function getCaretCoordinates(element: HTMLInputElement | HTMLTextAreaElement, position: number): { x: number, y: number } {
    // Create a mirror div to measure text position
    const div = document.createElement('div');
    const style = window.getComputedStyle(element);

    // Copy all relevant styles
    const properties = [
        'font-family', 'font-size', 'font-weight', 'font-style',
        'letter-spacing', 'text-transform', 'word-spacing', 'text-indent',
        'white-space', 'line-height', 'padding-top', 'padding-right',
        'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width',
        'border-bottom-width', 'border-left-width', 'box-sizing'
    ];

    properties.forEach(prop => {
        div.style.setProperty(prop, style.getPropertyValue(prop));
    });

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = element.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
    div.style.overflowWrap = 'break-word';
    div.style.width = element.offsetWidth + 'px';
    div.style.height = element.offsetHeight + 'px';

    document.body.appendChild(div);

    // Insert text up to position
    const text = element.value.substring(0, position);
    div.textContent = text;

    // Create a span at the caret position
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);

    // Get coordinates
    const rect = element.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();

    const x = spanRect.left;
    const y = spanRect.top;

    document.body.removeChild(div);

    return { x, y };
}

// Theme functions
function applyTheme(themeName: string) {
    document.documentElement.setAttribute('data-theme', themeName);
}

function selectTheme(themeName: string) {
    state.theme = themeName;
    throttledSave();
    applyTheme(themeName);

    // Update active state in UI
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-theme') === themeName) {
            option.classList.add('active');
        }
    });

    // Reorder theme options to show active theme first
    const themeSelector = document.querySelector('.theme-selector')!;
    const themeOptions = Array.from(themeSelector.querySelectorAll('.theme-option'));

    // Sort so active theme comes first
    themeOptions.sort((a, b) => {
        const aActive = a.classList.contains('active') ? 0 : 1;
        const bActive = b.classList.contains('active') ? 0 : 1;
        return aActive - bActive;
    });

    // Clear and re-append in new order
    themeSelector.innerHTML = '';
    themeOptions.forEach(option => themeSelector.appendChild(option));
}

function selectLanguage(lang: string) {
    state.language = lang;
    throttledSave();

    // Update the displayed language
    const selectedLanguageEl = document.getElementById('selectedLanguage');
    if (selectedLanguageEl && translations[lang]) {
        selectedLanguageEl.textContent = translations[lang].name;
    }

    // Update active state in UI
    document.querySelectorAll('.language-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-lang') === lang) {
            option.classList.add('active');
        }
    });

    // Update all UI text to the new language
    updateUILanguage();
}

function applyLanguage(lang: string) {
    const selectedLanguageEl = document.getElementById('selectedLanguage');
    if (selectedLanguageEl && translations[lang]) {
        selectedLanguageEl.textContent = translations[lang].name;
    }

    // Update active state in UI
    document.querySelectorAll('.language-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-lang') === lang) {
            option.classList.add('active');
        }
    });

    // Update all UI text to the selected language
    updateUILanguage();
}

// Drag and drop functionality
let draggedChannelId: string | null = null;

function setupChannelDragAndDrop() {
    const channelItems = document.querySelectorAll('.channel-item');

    channelItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedChannelId = item.getAttribute('data-id');
            item.classList.add('dragging');
            (e as DragEvent).dataTransfer!.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedChannelId = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            (e as DragEvent).dataTransfer!.dropEffect = 'move';

            const draggingItem = document.querySelector('.dragging');
            if (!draggingItem) return;

            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if ((e as DragEvent).clientY < midpoint) {
                item.classList.add('drag-over-top');
                item.classList.remove('drag-over-bottom');
            } else {
                item.classList.add('drag-over-bottom');
                item.classList.remove('drag-over-top');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over-top', 'drag-over-bottom');

            const targetId = item.getAttribute('data-id');
            if (!draggedChannelId || !targetId || draggedChannelId === targetId) return;

            const draggedIndex = state.channels.findIndex(c => c.id === draggedChannelId);
            const targetIndex = state.channels.findIndex(c => c.id === targetId);

            if (draggedIndex === -1 || targetIndex === -1) return;

            // Reorder channels
            const [draggedChannel] = state.channels.splice(draggedIndex, 1);
            state.channels.splice(targetIndex, 0, draggedChannel);

            // Update order property for all channels
            state.channels.forEach((channel, index) => {
                channel.order = index;
            });

            throttledSave();
            renderChannelsList();
        });
    });
}

let draggedImageIndex: number | null = null;

function setupImageDragAndDrop(channel: Channel) {
    const galleryItems = document.querySelectorAll('.gallery-item');

    galleryItems.forEach((item, index) => {
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', (e) => {
            draggedImageIndex = index;
            item.classList.add('dragging');
            (e as DragEvent).dataTransfer!.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedImageIndex = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            (e as DragEvent).dataTransfer!.dropEffect = 'move';

            const draggingItem = document.querySelector('.gallery-item.dragging');
            if (!draggingItem) return;

            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            if (draggedImageIndex === null || draggedImageIndex === index) return;

            // Reorder images - create a new array to avoid mutation issues
            const newImages = [...channel.images];
            const [draggedImage] = newImages.splice(draggedImageIndex, 1);
            newImages.splice(index, 0, draggedImage);
            channel.images = newImages;

            throttledSave();
            renderGallery(channel);
            renderChannelsList(); // Update preview image if first image changed
        });
    });
}

// Drag and drop for tags
let draggedTagName: string | null = null;

function setupTagDragAndDrop() {
    const tagItems = document.querySelectorAll('.existing-tag-item');

    tagItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedTagName = item.getAttribute('data-tag');
            item.classList.add('dragging');
            (e as DragEvent).dataTransfer!.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedTagName = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            (e as DragEvent).dataTransfer!.dropEffect = 'move';

            const draggingItem = document.querySelector('.existing-tag-item.dragging');
            if (!draggingItem) return;

            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if ((e as DragEvent).clientY < midpoint) {
                item.classList.add('drag-over-top');
                item.classList.remove('drag-over-bottom');
            } else {
                item.classList.add('drag-over-bottom');
                item.classList.remove('drag-over-top');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over-top', 'drag-over-bottom');

            const targetTagName = item.getAttribute('data-tag');
            if (!draggedTagName || !targetTagName || draggedTagName === targetTagName) return;

            const draggedIndex = state.tags.findIndex(t => t === draggedTagName);
            const targetIndex = state.tags.findIndex(t => t === targetTagName);

            if (draggedIndex === -1 || targetIndex === -1) return;

            // Reorder tags
            const [draggedTag] = state.tags.splice(draggedIndex, 1);
            state.tags.splice(targetIndex, 0, draggedTag);

            throttledSave();
            renderExistingTags();
            renderFilterTags();
            renderAvailableTags();
        });
    });
}

// Image comparison functionality
let selectedImagesForComparison: string[] = [];

function toggleImageSelection(imageUrl: string, itemElement: Element) {
    const index = selectedImagesForComparison.indexOf(imageUrl);

    if (index > -1) {
        // Remove from selection
        selectedImagesForComparison.splice(index, 1);
        itemElement.classList.remove('selected-for-comparison');
    } else {
        // Add to selection
        selectedImagesForComparison.push(imageUrl);
        itemElement.classList.add('selected-for-comparison');
    }

    updateCompareButton();
}

function updateCompareButton() {
    const compareBtn = document.getElementById('compareImagesBtn');
    const compareCount = document.getElementById('compareCount');

    if (!compareBtn || !compareCount) return;

    if (selectedImagesForComparison.length >= 2) {
        compareBtn.style.display = 'flex';
        compareCount.textContent = selectedImagesForComparison.length.toString();
    } else {
        compareBtn.style.display = 'none';
    }
}

function openComparisonModal() {
    if (selectedImagesForComparison.length < 2) return;

    const modal = document.getElementById('comparisonModal')!;
    const container = document.getElementById('comparisonContainer')!;

    container.innerHTML = selectedImagesForComparison.map((img, index) => `
        <div class="comparison-item">
            <img src="${img}" alt="Comparison ${index + 1}">
            <div class="comparison-item-label">Image ${index + 1}</div>
        </div>
    `).join('');

    modal.classList.add('active');
}

function closeComparisonModal() {
    document.getElementById('comparisonModal')!.classList.remove('active');
}

function clearComparisonSelection() {
    selectedImagesForComparison = [];
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.classList.remove('selected-for-comparison');
    });
    updateCompareButton();
    closeComparisonModal();
}

// Danbooru tag autocomplete
const danbooruTags: DanbooruTag[] = [
    // Quality & Rating tags
    { name: 'masterpiece', category: 'meta' },
    { name: 'best quality', category: 'meta' },
    { name: 'high quality', category: 'meta' },
    { name: 'absurdres', category: 'meta' },
    { name: 'highres', category: 'meta' },
    { name: 'ultra detailed', category: 'meta' },
    { name: '4k', category: 'meta' },
    { name: '8k', category: 'meta' },

    // Common general tags
    { name: '1girl', category: 'general' },
    { name: '1boy', category: 'general' },
    { name: '2girls', category: 'general' },
    { name: '2boys', category: 'general' },
    { name: 'multiple girls', category: 'general' },
    { name: 'multiple boys', category: 'general' },
    { name: 'solo', category: 'general' },
    { name: 'duo', category: 'general' },
    { name: 'group', category: 'general' },
    { name: 'looking at viewer', category: 'general' },
    { name: 'looking away', category: 'general' },
    { name: 'looking back', category: 'general' },
    { name: 'smile', category: 'general' },
    { name: 'grin', category: 'general' },
    { name: 'smirk', category: 'general' },
    { name: 'open mouth', category: 'general' },
    { name: 'closed mouth', category: 'general' },
    { name: 'closed eyes', category: 'general' },
    { name: 'blush', category: 'general' },
    { name: 'angry', category: 'general' },
    { name: 'sad', category: 'general' },
    { name: 'crying', category: 'general' },
    { name: 'laughing', category: 'general' },
    { name: 'embarrassed', category: 'general' },

    // Hair - Length
    { name: 'long hair', category: 'general' },
    { name: 'very long hair', category: 'general' },
    { name: 'short hair', category: 'general' },
    { name: 'medium hair', category: 'general' },
    { name: 'shoulder-length hair', category: 'general' },
    { name: 'waist-length hair', category: 'general' },

    // Hair - Color
    { name: 'blonde hair', category: 'general' },
    { name: 'brown hair', category: 'general' },
    { name: 'black hair', category: 'general' },
    { name: 'white hair', category: 'general' },
    { name: 'gray hair', category: 'general' },
    { name: 'silver hair', category: 'general' },
    { name: 'red hair', category: 'general' },
    { name: 'blue hair', category: 'general' },
    { name: 'pink hair', category: 'general' },
    { name: 'purple hair', category: 'general' },
    { name: 'green hair', category: 'general' },
    { name: 'orange hair', category: 'general' },
    { name: 'multicolored hair', category: 'general' },
    { name: 'gradient hair', category: 'general' },
    { name: 'two-tone hair', category: 'general' },

    // Hair - Style
    { name: 'ponytail', category: 'general' },
    { name: 'twin tails', category: 'general' },
    { name: 'side ponytail', category: 'general' },
    { name: 'braid', category: 'general' },
    { name: 'single braid', category: 'general' },
    { name: 'twin braids', category: 'general' },
    { name: 'french braid', category: 'general' },
    { name: 'bun', category: 'general' },
    { name: 'double bun', category: 'general' },
    { name: 'hair bun', category: 'general' },
    { name: 'messy hair', category: 'general' },
    { name: 'wavy hair', category: 'general' },
    { name: 'curly hair', category: 'general' },
    { name: 'straight hair', category: 'general' },
    { name: 'ahoge', category: 'general' },
    { name: 'bangs', category: 'general' },
    { name: 'blunt bangs', category: 'general' },

    // Eyes - Color
    { name: 'blue eyes', category: 'general' },
    { name: 'red eyes', category: 'general' },
    { name: 'green eyes', category: 'general' },
    { name: 'brown eyes', category: 'general' },
    { name: 'yellow eyes', category: 'general' },
    { name: 'purple eyes', category: 'general' },
    { name: 'pink eyes', category: 'general' },
    { name: 'orange eyes', category: 'general' },
    { name: 'golden eyes', category: 'general' },
    { name: 'heterochromia', category: 'general' },
    { name: 'multicolored eyes', category: 'general' },

    // Clothing - Tops
    { name: 'shirt', category: 'general' },
    { name: 't-shirt', category: 'general' },
    { name: 'blouse', category: 'general' },
    { name: 'sweater', category: 'general' },
    { name: 'hoodie', category: 'general' },
    { name: 'jacket', category: 'general' },
    { name: 'coat', category: 'general' },
    { name: 'cardigan', category: 'general' },
    { name: 'vest', category: 'general' },
    { name: 'blazer', category: 'general' },

    // Clothing - Bottoms
    { name: 'skirt', category: 'general' },
    { name: 'miniskirt', category: 'general' },
    { name: 'long skirt', category: 'general' },
    { name: 'pleated skirt', category: 'general' },
    { name: 'pants', category: 'general' },
    { name: 'jeans', category: 'general' },
    { name: 'shorts', category: 'general' },
    { name: 'leggings', category: 'general' },

    // Clothing - Dresses & Full Body
    { name: 'dress', category: 'general' },
    { name: 'sundress', category: 'general' },
    { name: 'wedding dress', category: 'general' },
    { name: 'evening gown', category: 'general' },
    { name: 'school uniform', category: 'general' },
    { name: 'sailor uniform', category: 'general' },
    { name: 'maid outfit', category: 'general' },
    { name: 'kimono', category: 'general' },
    { name: 'yukata', category: 'general' },
    { name: 'armor', category: 'general' },
    { name: 'military uniform', category: 'general' },
    { name: 'suit', category: 'general' },
    { name: 'tuxedo', category: 'general' },
    { name: 'pajamas', category: 'general' },
    { name: 'swimsuit', category: 'general' },
    { name: 'bikini', category: 'general' },
    { name: 'one-piece swimsuit', category: 'general' },

    // Accessories
    { name: 'glasses', category: 'general' },
    { name: 'sunglasses', category: 'general' },
    { name: 'hat', category: 'general' },
    { name: 'cap', category: 'general' },
    { name: 'bow', category: 'general' },
    { name: 'hair bow', category: 'general' },
    { name: 'ribbon', category: 'general' },
    { name: 'hair ribbon', category: 'general' },
    { name: 'headband', category: 'general' },
    { name: 'crown', category: 'general' },
    { name: 'tiara', category: 'general' },
    { name: 'earrings', category: 'general' },
    { name: 'necklace', category: 'general' },
    { name: 'bracelet', category: 'general' },
    { name: 'gloves', category: 'general' },
    { name: 'scarf', category: 'general' },
    { name: 'necktie', category: 'general' },
    { name: 'bowtie', category: 'general' },

    // Backgrounds & Settings
    { name: 'outdoors', category: 'general' },
    { name: 'indoors', category: 'general' },
    { name: 'city', category: 'general' },
    { name: 'street', category: 'general' },
    { name: 'alley', category: 'general' },
    { name: 'park', category: 'general' },
    { name: 'forest', category: 'general' },
    { name: 'mountain', category: 'general' },
    { name: 'beach', category: 'general' },
    { name: 'ocean', category: 'general' },
    { name: 'lake', category: 'general' },
    { name: 'river', category: 'general' },
    { name: 'desert', category: 'general' },
    { name: 'snow', category: 'general' },
    { name: 'rain', category: 'general' },
    { name: 'sky', category: 'general' },
    { name: 'clouds', category: 'general' },
    { name: 'night', category: 'general' },
    { name: 'day', category: 'general' },
    { name: 'sunset', category: 'general' },
    { name: 'sunrise', category: 'general' },
    { name: 'twilight', category: 'general' },
    { name: 'starry sky', category: 'general' },
    { name: 'moon', category: 'general' },
    { name: 'stars', category: 'general' },
    { name: 'cherry blossoms', category: 'general' },
    { name: 'autumn leaves', category: 'general' },
    { name: 'flower field', category: 'general' },
    { name: 'garden', category: 'general' },
    { name: 'classroom', category: 'general' },
    { name: 'bedroom', category: 'general' },
    { name: 'kitchen', category: 'general' },
    { name: 'library', category: 'general' },
    { name: 'cafe', category: 'general' },
    { name: 'restaurant', category: 'general' },
    { name: 'office', category: 'general' },
    { name: 'castle', category: 'general' },
    { name: 'church', category: 'general' },
    { name: 'temple', category: 'general' },
    { name: 'shrine', category: 'general' },

    // Poses & Actions
    { name: 'standing', category: 'general' },
    { name: 'sitting', category: 'general' },
    { name: 'lying', category: 'general' },
    { name: 'kneeling', category: 'general' },
    { name: 'crouching', category: 'general' },
    { name: 'walking', category: 'general' },
    { name: 'running', category: 'general' },
    { name: 'jumping', category: 'general' },
    { name: 'flying', category: 'general' },
    { name: 'fighting', category: 'general' },
    { name: 'dancing', category: 'general' },
    { name: 'singing', category: 'general' },
    { name: 'reading', category: 'general' },
    { name: 'eating', category: 'general' },
    { name: 'drinking', category: 'general' },
    { name: 'sleeping', category: 'general' },
    { name: 'waving', category: 'general' },
    { name: 'pointing', category: 'general' },
    { name: 'reaching', category: 'general' },
    { name: 'hugging', category: 'general' },
    { name: 'holding hands', category: 'general' },

    // Hand Positions
    { name: 'arms up', category: 'general' },
    { name: 'arms behind back', category: 'general' },
    { name: 'arms crossed', category: 'general' },
    { name: 'hand on hip', category: 'general' },
    { name: 'hand on own face', category: 'general' },
    { name: 'hand on own cheek', category: 'general' },
    { name: 'hand in pocket', category: 'general' },
    { name: 'peace sign', category: 'general' },
    { name: 'thumbs up', category: 'general' },
    { name: 'waving', category: 'general' },

    // Art Styles
    { name: 'anime', category: 'meta' },
    { name: 'manga', category: 'meta' },
    { name: 'chibi', category: 'meta' },
    { name: 'realistic', category: 'meta' },
    { name: 'photorealistic', category: 'meta' },
    { name: 'semi-realistic', category: 'meta' },
    { name: 'sketch', category: 'meta' },
    { name: 'lineart', category: 'meta' },
    { name: 'painting', category: 'meta' },
    { name: 'oil painting', category: 'meta' },
    { name: 'watercolor', category: 'meta' },
    { name: 'digital art', category: 'meta' },
    { name: 'pixel art', category: 'meta' },
    { name: 'cel shading', category: 'meta' },
    { name: 'retro style', category: 'meta' },
    { name: 'vintage', category: 'meta' },
    { name: 'fantasy', category: 'meta' },
    { name: 'sci-fi', category: 'meta' },
    { name: 'cyberpunk', category: 'meta' },
    { name: 'steampunk', category: 'meta' },

    // Composition
    { name: 'portrait', category: 'general' },
    { name: 'upper body', category: 'general' },
    { name: 'cowboy shot', category: 'general' },
    { name: 'full body', category: 'general' },
    { name: 'close-up', category: 'general' },
    { name: 'face focus', category: 'general' },
    { name: 'from above', category: 'general' },
    { name: 'from below', category: 'general' },
    { name: 'from side', category: 'general' },
    { name: 'from behind', category: 'general' },
    { name: 'profile', category: 'general' },
    { name: 'three-quarter view', category: 'general' },
    { name: 'dynamic angle', category: 'general' },
    { name: 'dutch angle', category: 'general' },

    // Lighting
    { name: 'dramatic lighting', category: 'general' },
    { name: 'soft lighting', category: 'general' },
    { name: 'hard lighting', category: 'general' },
    { name: 'backlighting', category: 'general' },
    { name: 'rim lighting', category: 'general' },
    { name: 'sunlight', category: 'general' },
    { name: 'moonlight', category: 'general' },
    { name: 'candlelight', category: 'general' },
    { name: 'god rays', category: 'general' },
    { name: 'lens flare', category: 'general' },
    { name: 'volumetric lighting', category: 'general' },
    { name: 'neon lights', category: 'general' },
    { name: 'glowing', category: 'general' },

    // Effects & Atmosphere
    { name: 'depth of field', category: 'meta' },
    { name: 'bokeh', category: 'meta' },
    { name: 'bloom', category: 'meta' },
    { name: 'chromatic aberration', category: 'meta' },
    { name: 'motion blur', category: 'meta' },
    { name: 'film grain', category: 'meta' },
    { name: 'particles', category: 'general' },
    { name: 'sparkle', category: 'general' },
    { name: 'light particles', category: 'general' },
    { name: 'petals', category: 'general' },
    { name: 'falling petals', category: 'general' },
    { name: 'bubbles', category: 'general' },
    { name: 'floating', category: 'general' },
    { name: 'wind', category: 'general' },
    { name: 'wind lift', category: 'general' },

    // Fantasy & Magical Elements
    { name: 'wings', category: 'general' },
    { name: 'angel wings', category: 'general' },
    { name: 'demon wings', category: 'general' },
    { name: 'dragon wings', category: 'general' },
    { name: 'horns', category: 'general' },
    { name: 'tail', category: 'general' },
    { name: 'animal ears', category: 'general' },
    { name: 'cat ears', category: 'general' },
    { name: 'fox ears', category: 'general' },
    { name: 'wolf ears', category: 'general' },
    { name: 'bunny ears', category: 'general' },
    { name: 'elf ears', category: 'general' },
    { name: 'pointy ears', category: 'general' },
    { name: 'halo', category: 'general' },
    { name: 'magic', category: 'general' },
    { name: 'magic circle', category: 'general' },
    { name: 'spell', category: 'general' },
    { name: 'staff', category: 'general' },
    { name: 'wand', category: 'general' },
    { name: 'sword', category: 'general' },
    { name: 'katana', category: 'general' },
    { name: 'weapon', category: 'general' },

    // Additional Details
    { name: 'detailed background', category: 'meta' },
    { name: 'simple background', category: 'meta' },
    { name: 'white background', category: 'meta' },
    { name: 'black background', category: 'meta' },
    { name: 'gradient background', category: 'meta' },
    { name: 'transparent background', category: 'meta' },
    { name: 'cinematic', category: 'meta' },
    { name: 'epic', category: 'meta' },
    { name: 'beautiful', category: 'meta' },
    { name: 'cute', category: 'meta' },
    { name: 'elegant', category: 'meta' },
    { name: 'dynamic pose', category: 'general' },
    { name: 'detailed eyes', category: 'meta' },
    { name: 'detailed face', category: 'meta' },

    // Body Features & Proportions
    { name: 'tall', category: 'general' },
    { name: 'short', category: 'general' },
    { name: 'slender', category: 'general' },
    { name: 'muscular', category: 'general' },
    { name: 'slim', category: 'general' },
    { name: 'petite', category: 'general' },
    { name: 'curvy', category: 'general' },

    // Facial Features
    { name: 'freckles', category: 'general' },
    { name: 'mole', category: 'general' },
    { name: 'beauty mark', category: 'general' },
    { name: 'scar', category: 'general' },
    { name: 'facial mark', category: 'general' },
    { name: 'makeup', category: 'general' },
    { name: 'lipstick', category: 'general' },
    { name: 'eyeliner', category: 'general' },
    { name: 'eyeshadow', category: 'general' },

    // More Expressions
    { name: 'wink', category: 'general' },
    { name: 'tongue out', category: 'general' },
    { name: 'pout', category: 'general' },
    { name: 'serious', category: 'general' },
    { name: 'determined', category: 'general' },
    { name: 'surprised', category: 'general' },
    { name: 'shocked', category: 'general' },
    { name: 'scared', category: 'general' },
    { name: 'nervous', category: 'general' },
    { name: 'sleepy', category: 'general' },
    { name: 'tired', category: 'general' },
    { name: 'expressionless', category: 'general' },

    // More Hair Styles
    { name: 'pigtails', category: 'general' },
    { name: 'drill hair', category: 'general' },
    { name: 'spiky hair', category: 'general' },
    { name: 'hair over one eye', category: 'general' },
    { name: 'hair between eyes', category: 'general' },
    { name: 'hair behind ear', category: 'general' },
    { name: 'hair ornament', category: 'general' },
    { name: 'hairclip', category: 'general' },
    { name: 'hair flower', category: 'general' },
    { name: 'side braid', category: 'general' },
    { name: 'wet hair', category: 'general' },
    { name: 'floating hair', category: 'general' },

    // Footwear
    { name: 'shoes', category: 'general' },
    { name: 'boots', category: 'general' },
    { name: 'high heels', category: 'general' },
    { name: 'sneakers', category: 'general' },
    { name: 'sandals', category: 'general' },
    { name: 'slippers', category: 'general' },
    { name: 'barefoot', category: 'general' },

    // Legwear
    { name: 'thighhighs', category: 'general' },
    { name: 'stockings', category: 'general' },
    { name: 'pantyhose', category: 'general' },
    { name: 'knee socks', category: 'general' },
    { name: 'socks', category: 'general' },
    { name: 'fishnet', category: 'general' },

    // Weather & Time
    { name: 'cloudy', category: 'general' },
    { name: 'foggy', category: 'general' },
    { name: 'storm', category: 'general' },
    { name: 'lightning', category: 'general' },
    { name: 'rainbow', category: 'general' },
    { name: 'dawn', category: 'general' },
    { name: 'dusk', category: 'general' },
    { name: 'midnight', category: 'general' },
    { name: 'golden hour', category: 'general' },
    { name: 'blue hour', category: 'general' },

    // Nature Elements
    { name: 'tree', category: 'general' },
    { name: 'grass', category: 'general' },
    { name: 'flowers', category: 'general' },
    { name: 'rose', category: 'general' },
    { name: 'lily', category: 'general' },
    { name: 'sunflower', category: 'general' },
    { name: 'leaves', category: 'general' },
    { name: 'vines', category: 'general' },
    { name: 'water', category: 'general' },
    { name: 'waterfall', category: 'general' },
    { name: 'ripples', category: 'general' },
    { name: 'waves', category: 'general' },
    { name: 'fire', category: 'general' },
    { name: 'flames', category: 'general' },
    { name: 'smoke', category: 'general' },
    { name: 'mist', category: 'general' },
    { name: 'fog', category: 'general' },

    // Animals & Creatures
    { name: 'cat', category: 'general' },
    { name: 'dog', category: 'general' },
    { name: 'bird', category: 'general' },
    { name: 'butterfly', category: 'general' },
    { name: 'dragon', category: 'general' },
    { name: 'phoenix', category: 'general' },
    { name: 'wolf', category: 'general' },
    { name: 'fox', category: 'general' },
    { name: 'deer', category: 'general' },
    { name: 'rabbit', category: 'general' },
    { name: 'fish', category: 'general' },
    { name: 'snake', category: 'general' },

    // Objects & Items
    { name: 'book', category: 'general' },
    { name: 'cup', category: 'general' },
    { name: 'teacup', category: 'general' },
    { name: 'umbrella', category: 'general' },
    { name: 'parasol', category: 'general' },
    { name: 'fan', category: 'general' },
    { name: 'phone', category: 'general' },
    { name: 'bag', category: 'general' },
    { name: 'backpack', category: 'general' },
    { name: 'flower basket', category: 'general' },
    { name: 'lantern', category: 'general' },
    { name: 'candle', category: 'general' },
    { name: 'lamp', category: 'general' },
    { name: 'mirror', category: 'general' },
    { name: 'window', category: 'general' },
    { name: 'door', category: 'general' },
    { name: 'chair', category: 'general' },
    { name: 'table', category: 'general' },
    { name: 'bed', category: 'general' },
    { name: 'bench', category: 'general' },

    // Weapons & Combat
    { name: 'bow (weapon)', category: 'general' },
    { name: 'arrow', category: 'general' },
    { name: 'spear', category: 'general' },
    { name: 'axe', category: 'general' },
    { name: 'dagger', category: 'general' },
    { name: 'shield', category: 'general' },
    { name: 'gun', category: 'general' },
    { name: 'rifle', category: 'general' },
    { name: 'pistol', category: 'general' },
    { name: 'scythe', category: 'general' },
    { name: 'holding weapon', category: 'general' },
    { name: 'dual wielding', category: 'general' },
    { name: 'sheathed', category: 'general' },
    { name: 'unsheathing', category: 'general' },

    // Food & Drink
    { name: 'food', category: 'general' },
    { name: 'tea', category: 'general' },
    { name: 'coffee', category: 'general' },
    { name: 'cake', category: 'general' },
    { name: 'bread', category: 'general' },
    { name: 'fruit', category: 'general' },
    { name: 'apple', category: 'general' },
    { name: 'strawberry', category: 'general' },
    { name: 'ice cream', category: 'general' },
    { name: 'candy', category: 'general' },
    { name: 'chocolate', category: 'general' },

    // Music & Instruments
    { name: 'music', category: 'general' },
    { name: 'musical note', category: 'general' },
    { name: 'piano', category: 'general' },
    { name: 'guitar', category: 'general' },
    { name: 'violin', category: 'general' },
    { name: 'flute', category: 'general' },
    { name: 'microphone', category: 'general' },
    { name: 'headphones', category: 'general' },

    // Celestial & Space
    { name: 'planet', category: 'general' },
    { name: 'galaxy', category: 'general' },
    { name: 'constellation', category: 'general' },
    { name: 'comet', category: 'general' },
    { name: 'meteor', category: 'general' },
    { name: 'shooting star', category: 'general' },
    { name: 'nebula', category: 'general' },
    { name: 'space', category: 'general' },

    // Architecture
    { name: 'building', category: 'general' },
    { name: 'tower', category: 'general' },
    { name: 'bridge', category: 'general' },
    { name: 'stairs', category: 'general' },
    { name: 'balcony', category: 'general' },
    { name: 'rooftop', category: 'general' },
    { name: 'ruins', category: 'general' },
    { name: 'pillar', category: 'general' },
    { name: 'arch', category: 'general' },
    { name: 'gate', category: 'general' },
    { name: 'fence', category: 'general' },
    { name: 'wall', category: 'general' },

    // Vehicles
    { name: 'car', category: 'general' },
    { name: 'motorcycle', category: 'general' },
    { name: 'bicycle', category: 'general' },
    { name: 'train', category: 'general' },
    { name: 'airplane', category: 'general' },
    { name: 'helicopter', category: 'general' },
    { name: 'ship', category: 'general' },
    { name: 'boat', category: 'general' },

    // Character Types & Roles
    { name: 'maid', category: 'general' },
    { name: 'nurse', category: 'general' },
    { name: 'teacher', category: 'general' },
    { name: 'student', category: 'general' },
    { name: 'warrior', category: 'general' },
    { name: 'knight', category: 'general' },
    { name: 'samurai', category: 'general' },
    { name: 'ninja', category: 'general' },
    { name: 'mage', category: 'general' },
    { name: 'wizard', category: 'general' },
    { name: 'witch', category: 'general' },
    { name: 'priest', category: 'general' },
    { name: 'archer', category: 'general' },
    { name: 'assassin', category: 'general' },
    { name: 'pirate', category: 'general' },
    { name: 'idol', category: 'general' },
    { name: 'angel', category: 'general' },
    { name: 'demon', category: 'general' },
    { name: 'vampire', category: 'general' },
    { name: 'ghost', category: 'general' },
    { name: 'robot', category: 'general' },
    { name: 'android', category: 'general' },
    { name: 'cyborg', category: 'general' },
    { name: 'elf', category: 'general' },
    { name: 'fairy', category: 'general' },
    { name: 'mermaid', category: 'general' },
    { name: 'kemonomimi', category: 'general' },
    { name: 'furry', category: 'general' },

    // Additional Poses
    { name: 'leaning', category: 'general' },
    { name: 'leaning forward', category: 'general' },
    { name: 'leaning back', category: 'general' },
    { name: 'stretching', category: 'general' },
    { name: 'yawning', category: 'general' },
    { name: 'praying', category: 'general' },
    { name: 'bowing', category: 'general' },
    { name: 'curtsy', category: 'general' },
    { name: 'salute', category: 'general' },
    { name: 'crossed legs', category: 'general' },
    { name: 'legs up', category: 'general' },
    { name: 'indian style', category: 'general' },

    // Seasonal & Holiday
    { name: 'spring', category: 'general' },
    { name: 'summer', category: 'general' },
    { name: 'autumn', category: 'general' },
    { name: 'fall', category: 'general' },
    { name: 'winter', category: 'general' },
    { name: 'christmas', category: 'general' },
    { name: 'halloween', category: 'general' },
    { name: 'new year', category: 'general' },
    { name: 'valentine', category: 'general' },

    // Patterns & Textures
    { name: 'striped', category: 'general' },
    { name: 'plaid', category: 'general' },
    { name: 'polka dot', category: 'general' },
    { name: 'checkered', category: 'general' },
    { name: 'floral print', category: 'general' },
    { name: 'lace', category: 'general' },
    { name: 'frills', category: 'general' },

    // Additional Art Styles & Quality
    { name: '3d', category: 'meta' },
    { name: '2d', category: 'meta' },
    { name: 'traditional media', category: 'meta' },
    { name: 'concept art', category: 'meta' },
    { name: 'illustration', category: 'meta' },
    { name: 'comic', category: 'meta' },
    { name: 'monochrome', category: 'meta' },
    { name: 'grayscale', category: 'meta' },
    { name: 'sepia', category: 'meta' },
    { name: 'lineless', category: 'meta' },
    { name: 'sharp focus', category: 'meta' },
    { name: 'highly detailed', category: 'meta' },
    { name: 'intricate', category: 'meta' },
    { name: 'professional', category: 'meta' },
    { name: 'award winning', category: 'meta' },
    { name: 'trending on artstation', category: 'meta' },

    // Colors & Tones
    { name: 'colorful', category: 'general' },
    { name: 'vibrant', category: 'general' },
    { name: 'pastel colors', category: 'general' },
    { name: 'warm colors', category: 'general' },
    { name: 'cool colors', category: 'general' },
    { name: 'neon colors', category: 'general' },
    { name: 'dark', category: 'general' },
    { name: 'bright', category: 'general' },

    // Special Effects
    { name: 'reflection', category: 'general' },
    { name: 'refraction', category: 'general' },
    { name: 'mirror', category: 'general' },
    { name: 'silhouette', category: 'general' },
    { name: 'shadow', category: 'general' },
    { name: 'contrast', category: 'general' },
    { name: 'vignette', category: 'meta' },
    { name: 'symmetry', category: 'general' },
    { name: 'asymmetry', category: 'general' }
];

// Web Worker for tag search (offloads search to background thread)
let tagWorker: Worker | null = null;

function initTagWorker() {
    try {
        tagWorker = new Worker('./tag-worker.js');

        tagWorker.addEventListener('message', (e) => {
            const { type, data } = e.data;

            if (type === 'ready') {
                log('✅ Tag search worker initialized');
            } else if (type === 'results') {
                // Render autocomplete results
                renderAutocompleteResults(data);
            }
        });

        tagWorker.addEventListener('error', (error) => {
            error('Tag worker error:', error);
            tagWorker = null;
        });

        // Initialize worker with tags
        const allTags = [...danbooruTags, ...customDanbooruTags];
        tagWorker.postMessage({ type: 'init', data: { tags: allTags } });
    } catch (error) {
        warn('⚠️ Web Worker not supported, using main thread for tag search');
        tagWorker = null;
    }
}

function updateTagWorker() {
    if (tagWorker) {
        const allTags = [...danbooruTags, ...customDanbooruTags];
        tagWorker.postMessage({ type: 'update', data: { tags: allTags } });
    }
}

let currentTextarea: HTMLTextAreaElement | null = null;

// Debounced autocomplete function
const debouncedAutocomplete = debounce((query: string, textarea: HTMLTextAreaElement) => {
    currentTextarea = textarea;

    if (tagWorker) {
        // Use Web Worker for search
        tagWorker.postMessage({ type: 'search', data: { query, limit: 10 } });
    } else {
        // Fallback to main thread
        showTagAutocomplete(query, textarea);
    }
}, 150);

function showTagAutocomplete(query: string, textarea: HTMLTextAreaElement) {
    const autocomplete = document.getElementById('tagAutocomplete')!;

    if (!query || query.length < 2) {
        autocomplete.style.display = 'none';
        return;
    }

    // Combine default and custom tags
    const allTags = [...danbooruTags, ...customDanbooruTags];

    // Optimized filter: prioritize tags that start with query, then contain it
    const lowerQuery = query.toLowerCase();
    const startsWithMatches: typeof allTags = [];
    const containsMatches: typeof allTags = [];

    // Early exit optimization - stop after finding enough matches
    for (let i = 0; i < allTags.length && (startsWithMatches.length + containsMatches.length) < 50; i++) {
        const tag = allTags[i];
        const tagLower = tag.name.toLowerCase();

        if (tagLower.startsWith(lowerQuery)) {
            startsWithMatches.push(tag);
        } else if (tagLower.includes(lowerQuery)) {
            containsMatches.push(tag);
        }
    }

    // Combine and limit results - prioritize exact matches at the start
    autocompleteItems = [...startsWithMatches, ...containsMatches].slice(0, 10);
    renderAutocompleteResults(autocompleteItems, textarea);
}

function renderAutocompleteResults(items: DanbooruTag[], textarea?: HTMLTextAreaElement) {
    const autocomplete = document.getElementById('tagAutocomplete')!;

    // Use stored textarea if not provided (for Web Worker results)
    const targetTextarea = textarea || currentTextarea;
    if (!targetTextarea) return;

    autocompleteItems = items;

    if (autocompleteItems.length === 0) {
        autocomplete.style.display = 'none';
        return;
    }

    autocomplete.innerHTML = autocompleteItems.map((tag, index) => `
        <div class="tag-autocomplete-item ${index === autocompleteSelectedIndex ? 'selected' : ''}" data-index="${index}">
            <span class="tag-name">${tag.name}</span>
            <span class="tag-category ${tag.category}">${tag.category}</span>
        </div>
    `).join('');

    autocomplete.style.display = 'block';

    // Add click listeners
    autocomplete.querySelectorAll('.tag-autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index') || '0');
            insertTag(autocompleteItems[index].name, targetTextarea);
        });
    });
}

function insertTag(tagName: string, textarea: HTMLTextAreaElement) {
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);

    // Find the start of the current word
    const lastComma = textBefore.lastIndexOf(',');
    const wordStart = lastComma >= 0 ? lastComma + 1 : 0;

    // Replace the current word with the tag
    const beforeWord = textarea.value.substring(0, wordStart);
    const newText = beforeWord + (beforeWord.trim() && !beforeWord.endsWith(',') ? ', ' : '') + tagName + ', ' + textAfter;

    textarea.value = newText;
    const newCursorPos = (beforeWord + (beforeWord.trim() && !beforeWord.endsWith(',') ? ', ' : '') + tagName + ', ').length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();

    // Hide autocomplete
    document.getElementById('tagAutocomplete')!.style.display = 'none';
    autocompleteSelectedIndex = -1;
}

function getCurrentWord(text: string, cursorPos: number): string {
    const textBefore = text.substring(0, cursorPos);
    const lastComma = textBefore.lastIndexOf(',');
    const word = textBefore.substring(lastComma + 1).trim();
    return word;
}

function handleAutocompleteKeydown(e: KeyboardEvent, textarea: HTMLTextAreaElement) {
    const autocomplete = document.getElementById('tagAutocomplete')!;

    if (autocomplete.style.display === 'none') {
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex + 1, autocompleteItems.length - 1);
        updateAutocompleteSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, -1);
        updateAutocompleteSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (autocompleteSelectedIndex >= 0) {
            e.preventDefault();
            insertTag(autocompleteItems[autocompleteSelectedIndex].name, textarea);
        }
    } else if (e.key === 'Escape') {
        autocomplete.style.display = 'none';
        autocompleteSelectedIndex = -1;
    }
}

function updateAutocompleteSelection() {
    const items = document.querySelectorAll('.tag-autocomplete-item');
    items.forEach((item, index) => {
        if (index === autocompleteSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

// Danbooru Tag Management Functions
// Pagination for Danbooru tags rendering
let danbooruTagsPage = 0;
const DANBOORU_TAGS_PER_PAGE = 50;
let danbooruSearchQuery = '';

function renderDanbooruTags() {
    const tagsList = document.getElementById('danbooruTagsList')!;

    // Filter tags based on search query
    let filteredTags = customDanbooruTags;
    if (danbooruSearchQuery) {
        const query = danbooruSearchQuery.toLowerCase();
        filteredTags = customDanbooruTags.filter(tag =>
            tag.name.toLowerCase().includes(query)
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

    // Sort filtered tags alphabetically by name (A-Z)
    const sortedTags = [...filteredTags].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    // Calculate pagination
    const totalPages = Math.ceil(sortedTags.length / DANBOORU_TAGS_PER_PAGE);
    const startIndex = danbooruTagsPage * DANBOORU_TAGS_PER_PAGE;
    const endIndex = Math.min(startIndex + DANBOORU_TAGS_PER_PAGE, sortedTags.length);
    const visibleTags = sortedTags.slice(startIndex, endIndex);

    // Render visible tags only
    const tagsHTML = visibleTags.map((tag) => {
        // Find original index for deletion
        const originalIndex = customDanbooruTags.findIndex(t => t.name === tag.name && t.category === tag.category);
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
    `}).join('');

    // Add pagination controls - circular navigation
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

    // Add delete listeners
    tagsList.querySelectorAll('.btn-delete-danbooru-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index') || '0');
            deleteDanbooruTag(index);
        });
    });

    // Add pagination listeners with circular navigation
    if (totalPages > 1) {
        document.getElementById('prevDanbooruPage')?.addEventListener('click', () => {
            if (danbooruTagsPage > 0) {
                danbooruTagsPage--;
            } else {
                // Go to last page when at first page
                danbooruTagsPage = totalPages - 1;
            }
            renderDanbooruTags();
        });

        document.getElementById('nextDanbooruPage')?.addEventListener('click', () => {
            if (danbooruTagsPage < totalPages - 1) {
                danbooruTagsPage++;
            } else {
                // Go to first page when at last page
                danbooruTagsPage = 0;
            }
            renderDanbooruTags();
        });
    }
}

function addDanbooruTag() {
    const input = document.getElementById('newDanbooruTagInput') as HTMLInputElement;
    const select = document.getElementById('danbooruCategorySelect') as HTMLSelectElement;
    const tagName = input.value.trim().toLowerCase();
    const category = select.value as DanbooruTag['category'];

    if (!tagName) {
        const btn = document.getElementById('addDanbooruTagBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    // Check if tag already exists
    const exists = customDanbooruTags.some(tag => tag.name === tagName) ||
                   danbooruTags.some(tag => tag.name === tagName);

    if (exists) {
        const btn = document.getElementById('addDanbooruTagBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    customDanbooruTags.push({ name: tagName, category });
    input.value = '';
    renderDanbooruTags();
    updateTagWorker(); // Update worker with new tags
    throttledSave();
}

function deleteDanbooruTag(index: number) {
    customDanbooruTags.splice(index, 1);
    renderDanbooruTags();
    updateTagWorker(); // Update worker with new tags
    throttledSave();
}

function bulkImportDanbooruTags() {
    const textarea = document.getElementById('bulkDanbooruInput') as HTMLTextAreaElement;
    const select = document.getElementById('danbooruCategorySelect') as HTMLSelectElement;
    const input = textarea.value.trim();
    const category = select.value as DanbooruTag['category'];

    if (!input) {
        const btn = document.getElementById('bulkImportBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    // Split by commas and clean up
    const tagNames = input.split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0);

    if (tagNames.length === 0) {
        const btn = document.getElementById('bulkImportBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    let addedCount = 0;
    tagNames.forEach(tagName => {
        // Check if tag already exists
        const exists = customDanbooruTags.some(tag => tag.name === tagName) ||
                       danbooruTags.some(tag => tag.name === tagName);

        if (!exists) {
            // Use selected category from dropdown
            customDanbooruTags.push({ name: tagName, category });
            addedCount++;
        }
    });

    if (addedCount === 0) {
        // All tags already exist, shake the button
        const btn = document.getElementById('bulkImportBtn');
        if (btn) {
            shakeElement(btn as HTMLElement);
        }
        return;
    }

    textarea.value = '';
    renderDanbooruTags();
    updateTagWorker(); // Update worker with new tags
    throttledSave();

    if (addedCount < tagNames.length) {
        // Some tags were duplicates
        alert(`Added ${addedCount} new tag(s). ${tagNames.length - addedCount} tag(s) already existed.`);
    }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        // Ctrl/Cmd + N: New Channel
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            openChannelModal();
        }

        // Escape: Close modals
        if (e.key === 'Escape') {
            const activeModals = document.querySelectorAll('.modal.active');
            activeModals.forEach(modal => {
                if (modal.id === 'channelModal') closeChannelModal();
                if (modal.id === 'tagsModal') closeTagsModal();
                if (modal.id === 'imageModal') closeImageModal();
                if (modal.id === 'settingsModal') closeSettingsModal();
                if (modal.id === 'galleryModal') closeGalleryModal();
                if (modal.id === 'danbooruTagManagerModal') closeDanbooruTagManagerModal();
                if (modal.id === 'comparisonModal') closeComparisonModal();
                if (modal.id === 'confirmModal') closeConfirmModal(false);
            });
        }

        // Ctrl/Cmd + S: Export data
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            exportData();
        }

        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput') as HTMLInputElement;
            searchInput?.focus();
        }

        // Ctrl/Cmd + Z: Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }

        // Arrow navigation in image modal
        const imageModal = document.getElementById('imageModal');
        if (imageModal?.classList.contains('active')) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                navigateImage('prev');
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                navigateImage('next');
            }
        }

        // Arrow navigation for channel pagination (when no modal is open and no input is focused)
        const activeModals = document.querySelectorAll('.modal.active');
        const isFocusedOnInput = document.activeElement?.tagName === 'INPUT' ||
                                 document.activeElement?.tagName === 'TEXTAREA';

        if (activeModals.length === 0 && !isFocusedOnInput) {
            if (e.key === 'ArrowLeft') {
                const prevBtn = document.getElementById('prevChannelPage') as HTMLButtonElement;
                if (prevBtn) {
                    e.preventDefault();
                    prevBtn.click();
                }
            }
            if (e.key === 'ArrowRight') {
                const nextBtn = document.getElementById('nextChannelPage') as HTMLButtonElement;
                if (nextBtn) {
                    e.preventDefault();
                    nextBtn.click();
                }
            }
        }
    });
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Setup keyboard shortcuts after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupKeyboardShortcuts);
} else {
    setupKeyboardShortcuts();
}
