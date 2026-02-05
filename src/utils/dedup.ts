import { Actor, log } from 'apify';
import type { KeyValueStore } from 'apify';

export class PlaceDeduper {
  private readonly store: KeyValueStore;

  private readonly maxSize: number;

  private readonly memoryMap: Map<string, true>;

  private constructor(store: KeyValueStore, maxSize: number) {
    this.store = store;
    this.maxSize = maxSize;
    this.memoryMap = new Map<string, true>();
  }

  static async create(maxSize = 50000): Promise<PlaceDeduper> {
    const store = await Actor.openKeyValueStore('place-dedup');
    log.info('PlaceDeduper initialized', { maxSize, storeId: store.id });
    return new PlaceDeduper(store, maxSize);
  }

  private touch(key: string): void {
    if (this.memoryMap.has(key)) {
      this.memoryMap.delete(key);
    }

    this.memoryMap.set(key, true);

    if (this.memoryMap.size > this.maxSize) {
      const oldestKey = this.memoryMap.keys().next().value as string | undefined;
      if (oldestKey) {
        this.memoryMap.delete(oldestKey);
      }
    }
  }

  async isDuplicate(key: string): Promise<boolean> {
    if (!key) return false;

    if (this.memoryMap.has(key)) {
      return true;
    }

    const persisted = await this.store.getValue<boolean>(key);
    if (persisted) {
      this.touch(key);
      return true;
    }

    await this.store.setValue(key, true);
    this.touch(key);

    return false;
  }
}

export class ReviewDeduper {
  private readonly store: KeyValueStore;

  private readonly maxSize: number;

  private readonly memoryMap: Map<string, true>;

  private constructor(store: KeyValueStore, maxSize: number) {
    this.store = store;
    this.maxSize = maxSize;
    this.memoryMap = new Map<string, true>();
  }

  static async create(maxSize = 100000): Promise<ReviewDeduper> {
    const store = await Actor.openKeyValueStore('review-dedup');
    log.info('ReviewDeduper initialized', { maxSize, storeId: store.id });
    return new ReviewDeduper(store, maxSize);
  }

  private touch(key: string): void {
    if (this.memoryMap.has(key)) {
      this.memoryMap.delete(key);
    }

    this.memoryMap.set(key, true);

    if (this.memoryMap.size > this.maxSize) {
      const oldestKey = this.memoryMap.keys().next().value as string | undefined;
      if (oldestKey) {
        this.memoryMap.delete(oldestKey);
      }
    }
  }

  async isDuplicate(key: string): Promise<boolean> {
    if (!key) return false;

    if (this.memoryMap.has(key)) {
      return true;
    }

    const persisted = await this.store.getValue<boolean>(key);
    if (persisted) {
      this.touch(key);
      return true;
    }

    await this.store.setValue(key, true);
    this.touch(key);

    return false;
  }
}
