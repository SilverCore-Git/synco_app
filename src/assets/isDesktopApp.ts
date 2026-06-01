export default function isDesktopApp(): boolean {
    // Check if running in Tauri context
    return (window as any).__TAURI__ !== undefined;
}

export function getTauriVersion(): string | null {
    if (!isDesktopApp()) return null;
    return (window as any).__TAURI__.__VERSION__;
}