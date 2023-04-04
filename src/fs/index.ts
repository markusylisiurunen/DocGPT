import fs from "node:fs/promises";
import path from "node:path";

export interface LazyDataPoint {
  readonly dataset: string;
  readonly segment: string;
  readonly id: string;
  listFiles(): Promise<{ name: string }[]>;
  loadFile(name: string): Promise<Buffer>;
  saveFile(name: string, data: Buffer): Promise<void>;
}

export interface LazyDataset {
  readonly name: string;
  listDataPoints(segment: string): Promise<LazyDataPoint[]>;
}

export function makeLazyDataPoint(dataset: string, segment: string, id: string): LazyDataPoint {
  return {
    dataset: dataset,
    segment: segment,
    id: id,
    async listFiles() {
      const entries = await fs.readdir(path.resolve("data", dataset, segment, id), {
        encoding: "utf-8",
        withFileTypes: true,
      });
      return entries.flatMap((entry) => (entry.isFile() ? { name: entry.name } : []));
    },
    async loadFile(name) {
      return fs.readFile(path.resolve("data", dataset, segment, id, name));
    },
    async saveFile(name, data) {
      await fs.writeFile(path.resolve("data", dataset, segment, id, name), data);
    },
  };
}

export function makeLazyDataset(dataset: string): LazyDataset {
  return {
    name: dataset,
    async listDataPoints(segment) {
      const entries = await fs.readdir(path.resolve("data", dataset, segment), {
        encoding: "utf-8",
        withFileTypes: true,
      });
      return entries.flatMap((entry) => (entry.isDirectory() ? makeLazyDataPoint(dataset, segment, entry.name) : []));
    },
  };
}
