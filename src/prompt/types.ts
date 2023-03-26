import type { LazyDataPoint, LazyDataset } from "../fs";

export interface PromptStrategy {
  init(dataset: LazyDataset): Promise<void>;
  getPrompt(dataPoint: LazyDataPoint): Promise<string>;
  parseCompletion(dataPoint: LazyDataPoint, completion: string): Promise<Record<string, unknown>>;
}
