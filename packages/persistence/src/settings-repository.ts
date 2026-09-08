export interface SettingsRepository {
  get(key: string, defaultValue?: any): Promise<any>;
  set(key: string, value: any): Promise<void>;
}

export class InMemorySettingsRepository implements SettingsRepository {
  private settings: Map<string, any> = new Map();

  constructor() {
    this.settings.set('theme', 'dark');
    this.settings.set('outputDirectory', './output');
  }

  async get(key: string, defaultValue?: any): Promise<any> {
    return this.settings.has(key) ? this.settings.get(key) : defaultValue;
  }

  async set(key: string, value: any): Promise<void> {
    this.settings.set(key, value);
  }
}
