import { z } from "zod";
import type { PromptStrategy } from "../types";

export function makeSimplePromptStrategy(): PromptStrategy {
  return {
    async init(_dataset) {
      return;
    },

    async getPrompt(dataPoint) {
      // read in the Cloud Vision output
      const cloudVision = (await dataPoint.loadFile("cloud-vision.json")).toString("utf-8");
      const words = z.array(z.object({ text: z.string() })).parse(JSON.parse(cloudVision));
      // construct the prompt line by line
      const lines: string[] = [];
      // give context to the model
      lines.push(
        [
          `Your task is to extract information from a receipt.`,
          `You will be given a list of words in the natural reading order, and you should respond with a JSON object with the following fields:`,
        ].join(" ")
      );
      // describe the requested schema
      lines.push("");
      lines.push("- `totalAmount` (number): The total amount that was paid, after discounts.");
      lines.push("- `dateOfPurchase` (ISO 8601 date string, e.g. `2023-01-27`): The date when the purchase was made.");
      lines.push("- `vendorName` (string): The full name of the vendor the purchase was made from.");
      lines.push("- `vendorStreet` (string): The name of the street where the vendor is located at.");
      lines.push("- `vendorCity` (string): The city where the vendor is located at.");
      lines.push("- `vendorPostalCode` (string): The postal code where the vendor is located at.");
      // add more specific orders for the response
      lines.push("");
      lines.push(
        [
          "Respond with only exactly one Markdown-formatted JSON code block.",
          "Format the response values with proper capitalization.",
          "If a value cannot be provided, set the corresponding field to `null`.",
        ].join(" ")
      );
      // give the input
      lines.push("");
      lines.push(`Here are the words from the receipt: ${words.map((w) => `"${w.text}"`).join(", ")}`);
      return lines.join("\n");
    },

    async parseCompletion(_dataPoint, completion) {
      const codeBlockRegExp = new RegExp("```(?:.+)?(\\{.+)```", "s");
      const matches = completion.match(codeBlockRegExp);
      // check if the match included a JSON code block
      const [, code] = matches ?? [];
      if (code) {
        // try to parse the code block as JSON
        try {
          const asJSON = JSON.parse(code);
          return asJSON;
        } catch (error) {
          return {};
        }
      }
      return {};
    },
  };
}
