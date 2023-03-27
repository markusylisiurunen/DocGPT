import vision from "@google-cloud/vision";
import { PromisePool } from "@supercharge/promise-pool";
import minimist from "minimist";
import * as openai from "openai";
import { z } from "zod";
import { makeLazyDataset } from "../fs";
import { makeSimplePromptStrategy } from "../prompt/strategy/simple";
import {
  compareDates,
  compareNumbers,
  compareStrings,
  computeF1Score,
  computePrecision,
  computeRecall,
  runSafely,
} from "../util";

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

async function performEvaluation(argv: minimist.ParsedArgs) {
  const args = z.object({ dataset: z.string() }).parse(argv);
  const knownLabels = ["COMPANY", "ADDRESS", "DATE", "TOTAL"];
  const dataset = makeLazyDataset(args.dataset);
  console.log(`performing evaluation for dataset "${args.dataset}"`);
  const dataPoints = (await dataset.listDataPoints("eval")).slice(0, 8); // FIXME:
  const results: { groundTruth: Record<string, string | null>; prediction: Record<string, string | null> }[] = [];
  const { errors } = await PromisePool.for(dataPoints)
    .withConcurrency(8)
    .process(async (dataPoint) => {
      console.log(`working on data point "${dataPoint.id}"`);
      // TODO:
      const api = new openai.OpenAIApi(
        new openai.Configuration({
          apiKey: process.env["OPENAI_API_KEY"] as string,
        })
      );
      try {
        const completion = await api.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: await makeSimplePromptStrategy().getPrompt(dataPoint) }],
          temperature: 0,
          n: 1,
        });
        const parsed = await makeSimplePromptStrategy().parseCompletion(
          dataPoint,
          completion.data.choices[0]?.message?.content ?? ""
        );
        // compute the F1-score
        const _groundTruthContent = (await dataPoint.loadFile("ground-truth.json")).toString("utf-8");
        const _groundTruthParsed = z.record(z.array(z.string())).parse(JSON.parse(_groundTruthContent));
        const groundTruth = Object.entries(_groundTruthParsed).reduce(
          (acc, [k, v]) => (knownLabels.includes(k) ? { ...acc, [k]: v[0]! } : acc),
          knownLabels.reduce((acc, label) => ({ ...acc, [label]: null }), {} as Record<string, string | null>)
        );
        const prediction = Object.entries(parsed).reduce(
          (acc, [k, v]) => (knownLabels.includes(k) ? { ...acc, [k]: v ?? null } : acc),
          knownLabels.reduce((acc, label) => ({ ...acc, [label]: null }), {} as Record<string, string | null>)
        );
        results.push({ groundTruth, prediction });
        // console.log("ground truth: ", JSON.stringify(groundTruth));
        // console.log("completion: ", JSON.stringify(parsed));
      } catch (error) {
        if ((error as any).response) {
          console.log((error as any).response.status);
          console.log((error as any).response.data);
        } else {
          console.log((error as any).message);
        }
      }
    });
  if (errors.length > 0) {
    console.log(`received the following errors while processing the data points`);
    for (const error of errors) {
      console.log(`  ${error.message}`);
    }
  }
  function matcher(label: string, a: string, b: string): boolean {
    if (label === "DATE") return compareDates()(a, b);
    if (label == "TOTAL") return compareNumbers()(a, b);
    return compareStrings(2)(a, b);
  }
  const precision = computePrecision(
    results.map((r) => r.prediction),
    results.map((r) => r.groundTruth),
    matcher
  );
  const recall = computeRecall(
    results.map((r) => r.prediction),
    results.map((r) => r.groundTruth),
    matcher
  );
  const f1Score = computeF1Score(
    results.map((r) => r.prediction),
    results.map((r) => r.groundTruth),
    matcher
  );
  console.log(
    "aggregated: ",
    JSON.stringify({ precision: precision.toFixed(4), recall: recall.toFixed(4), f1: f1Score.toFixed(4) })
  );
  for (const label of knownLabels) {
    const prediction = results.map((r) =>
      Object.entries(r.prediction)
        .filter(([l]) => l === label)
        .reduce((acc, [key, v]) => ({ ...acc, [key]: v }), {} as Record<string, string | null>)
    );
    const groundTruth = results.map((r) =>
      Object.entries(r.groundTruth)
        .filter(([l]) => l === label)
        .reduce((acc, [key, v]) => ({ ...acc, [key]: v }), {} as Record<string, string | null>)
    );
    const precision = computePrecision(prediction, groundTruth, matcher);
    const recall = computeRecall(prediction, groundTruth, matcher);
    const f1Score = computeF1Score(prediction, groundTruth, matcher);
    console.log(
      `${label}: `,
      JSON.stringify({ precision: precision.toFixed(4), recall: recall.toFixed(4), f1: f1Score.toFixed(4) })
    );
  }
  console.log("done processing");
}

async function main() {
  // configure available actions
  const actions: Record<string, (argv: minimist.ParsedArgs) => Promise<void>> = {};
  actions["cloud-vision-ocr"] = performCloudVisionOCR;
  actions["eval"] = performEvaluation;
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
