import vision from "@google-cloud/vision";
import { PromisePool } from "@supercharge/promise-pool";
import minimist from "minimist";
import { z } from "zod";
import { makeLazyDataset } from "../fs";
import { runSafely } from "../util";

async function performCloudVisionOCR(argv: minimist.ParsedArgs) {
  const client = new vision.ImageAnnotatorClient();
  const args = z.object({ dataset: z.string() }).parse(argv);
  const dataset = makeLazyDataset(args.dataset);
  console.log(`performing OCR for dataset "${args.dataset}"`);
  const dataPoints = await dataset.listDataPoints("eval"); // FIXME:
  const { errors } = await PromisePool.for(dataPoints)
    .withConcurrency(8)
    .process(async (dataPoint) => {
      console.log(`performing OCR for data point "${dataPoint.id}"`);
      // run the image through Cloud Vision API
      const annotated = await client.annotateImage({
        image: { content: (await dataPoint.loadFile("image.jpeg")).toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      });
      // parse the words from the result
      const pages = annotated[0].fullTextAnnotation!.pages!;
      const words = pages.flatMap((page) => {
        const blocks = page.blocks!;
        return blocks
          .filter((block) => block.blockType === "TEXT")
          .flatMap((block) => {
            const paragraphs = block.paragraphs!;
            return paragraphs.flatMap((paragraph) => {
              const words = paragraph.words!;
              return words
                .filter((word) => word.confidence! > 0.6)
                .flatMap((word) => {
                  const symbols = word.symbols!;
                  const text = symbols.map((symbol) => symbol.text).join("");
                  const vertices = word.boundingBox!.vertices!;
                  const x_min = Math.min(...[0, 1, 2, 3].map((i) => vertices[i]!.x!));
                  const x_max = Math.max(...[0, 1, 2, 3].map((i) => vertices[i]!.x!));
                  const y_min = Math.min(...[0, 1, 2, 3].map((i) => vertices[i]!.y!));
                  const y_max = Math.max(...[0, 1, 2, 3].map((i) => vertices[i]!.y!));
                  return {
                    x: x_min / page.width!,
                    y: y_min / page.height!,
                    width: (x_max - x_min) / page.width!,
                    height: (y_max - y_min) / page.height!,
                    text: text,
                  };
                });
            });
          });
      });
      // store the result
      await dataPoint.saveFile("cloud-vision.json", Buffer.from(JSON.stringify(words), "utf-8"));
    });
  if (errors.length > 0) {
    console.log(`received the following errors while processing the data points`);
    for (const error of errors) {
      console.log(`  ${error.message}`);
    }
  }
  console.log("done processing");
  await client.close();
}

async function main() {
  // configure available actions
  const actions: Record<string, (argv: minimist.ParsedArgs) => Promise<void>> = {};
  actions["cloud-vision-ocr"] = performCloudVisionOCR;
  // parse args
  const argv = minimist(process.argv.slice(2));
  const args = z.object({ action: z.string() }).parse(argv);
  // perform action
  if (!(args.action in actions)) {
    console.log(`unknown action, choose one of: ${Object.keys(actions).join(",")}`);
    return;
  }
  await actions[args.action]!(argv);
}

runSafely(main);
