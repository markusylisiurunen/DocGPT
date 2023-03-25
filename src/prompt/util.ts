import type { LazyDataPoint } from "../fs";

export interface PromptStrategy {
  getPromptForDatapoint(dataPoint: LazyDataPoint): Promise<string>;
}
