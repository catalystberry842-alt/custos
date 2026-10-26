import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Idempotency + memory for the agent. Holds no secrets. */
export interface SentStore {
  has(switchId: string, key: string): boolean;
  add(switchId: string, key: string): void;
  keys(switchId: string): Set<string>;
  lastEpoch(switchId: string): number | undefined;
  setLastEpoch(switchId: string, epoch: number): void;
}

export class MemoryStore implements SentStore {
  protected sent = new Map<string, Set<string>>();
  protected epochs = new Map<string, number>();
  has(id: string, key: string) { return this.sent.get(id)?.has(key) ?? false; }
  add(id: string, key: string) {
    if (!this.sent.has(id)) this.sent.set(id, new Set());
    this.sent.get(id)!.add(key);
    this.persist();
  }
  keys(id: string) { return new Set(this.sent.get(id) ?? []); }
  lastEpoch(id: string) { return this.epochs.get(id); }
  setLastEpoch(id: string, e: number) { this.epochs.set(id, e); this.persist(); }
  protected persist() {}
}

export class JsonFileStore extends MemoryStore {
  constructor(private path: string) {
    super();
    if (existsSync(path)) {
      const j = JSON.parse(readFileSync(path, "utf8")) as { sent: Record<string, string[]>; epochs: Record<string, number> };
      for (const [k, v] of Object.entries(j.sent ?? {})) this.sent.set(k, new Set(v));
      for (const [k, v] of Object.entries(j.epochs ?? {})) this.epochs.set(k, v);
    }
  }
  protected persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const j = {
      sent: Object.fromEntries([...this.sent].map(([k, v]) => [k, [...v]])),
      epochs: Object.fromEntries(this.epochs),
    };
    const tmp = this.path + ".tmp";
    writeFileSync(tmp, JSON.stringify(j, null, 2));
    renameSync(tmp, this.path);
  }
}
