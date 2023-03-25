import fs from "node:fs/promises";
import path from "node:path";

export interface LazyDataPoint {
  readonly dataset: string;
  readonly id: string;
  listFiles(): Promise<{ name: string }[]>;
  loadFile(name: string): Promise<Buffer>;
  saveFile(name: string, data: Buffer): Promise<void>;
}

export interface LazyDataset {
  listDataPoints(): Promise<LazyDataPoint[]>;
}

export function makeLazyDataPoint(dataset: string, id: string): LazyDataPoint {
  return {
    dataset: dataset,
    id: id,
    async listFiles() {
      const entries = await fs.readdir(path.resolve("data", dataset, id), {
        encoding: "utf-8",
        withFileTypes: true,
      });
      return entries.flatMap((entry) => (entry.isFile() ? { name: entry.name } : []));
    },
    async loadFile(name) {
      return fs.readFile(path.resolve("data", dataset, id, name));
    },
    async saveFile(name, data) {
      await fs.writeFile(path.resolve("data", dataset, id, name), data);
    },
  };
}

export function makeLazyDataset(dataset: string): LazyDataset {
  return {
    async listDataPoints() {
      const entries = await fs.readdir(path.resolve("data", dataset), {
        encoding: "utf-8",
        withFileTypes: true,
      });
      return entries.flatMap((entry) => (entry.isDirectory() ? makeLazyDataPoint(dataset, entry.name) : []));
    },
  };
}
