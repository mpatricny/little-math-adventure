import Phaser from 'phaser';

export class LocalizationService {
    private static instance: LocalizationService;
    private currentLanguage: string = 'cs';
    private translations: Record<string, any> = {};
    private scene: Phaser.Scene | null = null;

    static getInstance(): LocalizationService {
        if (!this.instance) {
            this.instance = new LocalizationService();
        }
        return this.instance;
    }

    /**
     * Initialize with a scene to access cache
     */
    init(scene: Phaser.Scene): void {
        this.scene = scene;
        // Try to load language from localStorage or default
        const savedLang = localStorage.getItem('language');
        if (savedLang) {
            this.currentLanguage = savedLang;
        }
        this.loadTranslations();
    }

    setLanguage(lang: string): void {
        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        this.loadTranslations();
    }

    private loadTranslations(): void {
        if (!this.scene) return;

        // In a real app we might load this async, but here we assume it's in cache
        // or we use the 'localization' cache key if we loaded it in BootScene
        const langData = this.scene.cache.json.get(`lang-${this.currentLanguage}`);
        if (langData) {
            this.translations = langData;
        } else {
            console.warn(`Language data for ${this.currentLanguage} not found in cache`);
        }
    }

    /**
     * Get translated text
     * @param key - Localization key like "ui.buttons.BTN_001"
     * @param params - Optional parameters for format strings
     */
    t(key: string, ...params: any[]): string {
        if (!key) return '';

        const path = key.split('.');
        let value = this.translations;

        for (const segment of path) {
            value = value?.[segment];
        }

        if (typeof value !== 'string') {
            // If key not found, return the key itself (or last part)
            return key;
        }

        const template = value as string;

        // Replace {0}, {1}, etc. with params
        return template.replace(/\{(\d+)\}/g, (_, index) => {
            const param = params[parseInt(index)];
            return param !== undefined ? String(param) : '';
        });
    }

    /**
     * Resolve localization key if string starts with $
     */
    resolve(text: string, ...params: any[]): string {
        if (text && text.startsWith('$')) {
            return this.t(text.slice(1), ...params);
        }
        return text;
    }
}
