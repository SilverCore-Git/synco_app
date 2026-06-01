import isDesktopApp from "./isDesktopApp";
import { invoke } from "@tauri-apps/api/core";

class LocalStore {
  private isDesktop = isDesktopApp();

  async get(key: string, defaultValue?: any): Promise<any> {
    if (this.isDesktop) {
      try {
        const result = await invoke<string>('get_config_value', { key });
        if (result && result.length > 0) {
          return JSON.parse(result);
        }
        return defaultValue;
      } catch (e) {
        console.warn(`Failed to get ${key} from Tauri store:`, e);
        return defaultValue;
      }
    } else {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    }
  }

  async set(key: string, value: any): Promise<void> {
    if (this.isDesktop) {
      try {
        await invoke('set_config_value', {
          key,
          value: JSON.stringify(value),
        });
      } catch (e) {
        console.error(`Failed to set ${key} in Tauri store:`, e);
      }
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  async remove(key: string): Promise<void> {
    if (this.isDesktop) {
      try {
        await invoke('remove_config_value', { key });
      } catch (e) {
        console.error(`Failed to remove ${key} from Tauri store:`, e);
      }
    } else {
      localStorage.removeItem(key);
    }
  }

  async clear(): Promise<void> {
    if (this.isDesktop) {
      console.warn('clear() is not fully supported in desktop mode');
    } else {
      localStorage.clear();
    }
  }

  // Synchronous version for web (localStorage) - desktop mode requires async
  getSync(key: string, defaultValue?: any): any {
    if (this.isDesktop) {
      console.warn('getSync() should not be used in desktop mode. Use get() instead.');
      return defaultValue;
    }
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  }

  setSync(key: string, value: any): void {
    if (this.isDesktop) {
      console.warn('setSync() should not be used in desktop mode. Use set() instead.');
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }
}

export default new LocalStore();
