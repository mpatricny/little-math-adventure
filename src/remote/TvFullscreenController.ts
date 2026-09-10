export type TvFullscreenState = 'unsupported' | 'windowed' | 'fullscreen';

type FullscreenRequestElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitCurrentFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenOperation = () => Promise<void> | void;

/**
 * Browser fullscreen adapter kept inside the remote module so Samsung-specific
 * fallbacks do not leak into game scenes or combat code.
 */
export class TvFullscreenController {
    private readonly element: FullscreenRequestElement;
    private readonly fullscreenDocument: FullscreenDocument;

    constructor(
        element: HTMLElement = document.documentElement,
        fullscreenDocument: Document = document,
    ) {
        this.element = element as FullscreenRequestElement;
        this.fullscreenDocument = fullscreenDocument as FullscreenDocument;
    }

    getState(): TvFullscreenState {
        if (!this.getRequestOperation()) return 'unsupported';
        return this.getFullscreenElement() ? 'fullscreen' : 'windowed';
    }

    isFullscreen(): boolean {
        return this.getFullscreenElement() !== null;
    }

    async enter(): Promise<boolean> {
        if (this.isFullscreen()) return true;
        const request = this.getRequestOperation();
        if (!request) return false;
        await this.runOperation(request);
        return this.isFullscreen();
    }

    async exit(): Promise<boolean> {
        if (!this.isFullscreen()) return true;
        const exit = this.getExitOperation();
        if (!exit) return false;
        await this.runOperation(exit);
        return !this.isFullscreen();
    }

    async toggle(): Promise<boolean> {
        return this.isFullscreen() ? this.exit() : this.enter();
    }

    onChange(listener: (state: TvFullscreenState) => void): () => void {
        const notify = () => listener(this.getState());
        const events = ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'];
        events.forEach((eventName) => this.fullscreenDocument.addEventListener(eventName, notify));
        notify();

        return () => {
            events.forEach((eventName) => this.fullscreenDocument.removeEventListener(eventName, notify));
        };
    }

    private getFullscreenElement(): Element | null {
        return this.fullscreenDocument.fullscreenElement
            ?? this.fullscreenDocument.webkitFullscreenElement
            ?? this.fullscreenDocument.webkitCurrentFullScreenElement
            ?? this.fullscreenDocument.msFullscreenElement
            ?? null;
    }

    private getRequestOperation(): FullscreenOperation | null {
        if (this.element.requestFullscreen) {
            return () => this.element.requestFullscreen({ navigationUI: 'hide' });
        }

        const vendorRequest = this.element.webkitRequestFullscreen
            ?? this.element.webkitRequestFullScreen
            ?? this.element.msRequestFullscreen;
        return vendorRequest ? vendorRequest.bind(this.element) : null;
    }

    private getExitOperation(): FullscreenOperation | null {
        const exit = this.fullscreenDocument.exitFullscreen
            ?? this.fullscreenDocument.webkitExitFullscreen
            ?? this.fullscreenDocument.webkitCancelFullScreen
            ?? this.fullscreenDocument.msExitFullscreen;
        return exit ? exit.bind(this.fullscreenDocument) : null;
    }

    private async runOperation(operation: FullscreenOperation): Promise<void> {
        const result = operation();
        if (result && typeof result.then === 'function') {
            await result;
        }
    }
}
