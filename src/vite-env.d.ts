/// <reference types="vite/client" />

declare module 'virtual:scene-assets' {
    const scenes: Record<string, string[]>;
    export default scenes;
}

declare module 'virtual:asset-downloads' {
    const plan: {
        images: Record<string, { url: string; bytes: number; decodedBytes: number }>;
        sceneKeys: Record<string, string[]>;
        scenes: Record<string, string[]>;
        all: string[];
    };
    export default plan;
}
