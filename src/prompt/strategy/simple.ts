import { z } from "zod";
import type { PromptStrategy } from "../util";

export function makeSimplePromptStrategy(): PromptStrategy {
  return {
    async getPromptForDatapoint(dataPoint) {
      const cloudVision = await dataPoint.loadFile("cloud-vision.json");
      const words = z.array(z.object({ text: z.string() })).parse(JSON.parse(cloudVision.toString("utf-8")));
      const lines = [
        `Here are the words from a receipt: ${words.map((w) => `"${w.text}"`).join(",")}`,
        ``,
        `Label each word with one of the following labels: "dateOfPurchase","vendorName","totalAmount","other"`,
        ``,
        `Answer with a JSON object with a field for "dateOfPurchase","vendorName" and "totalAmount" labels. Start your answer with exactly "\`\`\`json".`,
      ];
      return lines.join("\n");
    },
  };
}
