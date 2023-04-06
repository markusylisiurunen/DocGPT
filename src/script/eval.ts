import { PromisePool } from "@supercharge/promise-pool";
import minimist from "minimist";
import fs from "node:fs/promises";
import path from "node:path";
import * as openai from "openai";
import seedrandom from "seedrandom";
import { z } from "zod";
import { LazyDataPoint, makeLazyDataset } from "../fs";
import type { PromptStrategy } from "../prompt";
import { makeSimplePromptStrategy } from "../prompt";
import { makeICLD3IEStrategy } from "../prompt/strategy/icl-d3ie";
import {
  compareDates,
  compareNumbers,
  compareStrings,
  computeF1Score,
  computePrecision,
  computeRecall,
  runSafely,
} from "../util";

async function main() {
  const argv = minimist(process.argv.slice(2), { string: ["dataset", "seed", "strategy"] });
  const args = z
    .object({
      dataset: z.string(),
      limit: z.number().nullable().default(null),
      seed: z.string().default("42"),
      strategy: z.string(),
    })
    .parse(argv);
  const knownLabels = ["TOTAL", "DATE", "COMPANY", "ADDRESS"];
  const rng = seedrandom(args.seed);
  // init the dataset
  const dataset = makeLazyDataset(args.dataset);
  console.log(`performing evaluation for dataset "${args.dataset}" with strategy "${args.strategy}"`);
  // init the strategy
  let strategy: PromptStrategy;
  switch (args.strategy) {
    case "simple":
      strategy = makeSimplePromptStrategy();
      break;
    case "icl-d3ie":
      strategy = makeICLD3IEStrategy();
      break;
    default:
      console.log(`an unknown strategy: "${args.strategy}"`);
      return;
  }
  await strategy.init(dataset);
  // read in the data points
  let datapoints = await dataset.listDataPoints("eval");
  console.log(`read in ${datapoints.length} data points`);
  if (args.limit) {
    const source = [...datapoints];
    const target: LazyDataPoint[] = [];
    while (source.length > 0 && target.length < args.limit) {
      const idx = Math.floor(rng() * source.length);
      const [item] = source.splice(idx, 1);
      if (!item) {
        throw new Error("error shuffling the limit number of data points");
      }
      target.push(item);
    }
    console.log(`limit was set, limiting the data points to ${args.limit}`);
    datapoints = target;
  }
  // initialise OpenAI client
  const api = new openai.OpenAIApi(new openai.Configuration({ apiKey: process.env["OPENAI_API_KEY"] as string }));
  // compute predictions for each data point
  type Prediction = {
    id: string;
    predicted: Record<string, string | null>;
    groundTruth: Record<string, string | null>;
  };
  const { results: predictions, errors } = await PromisePool.for(datapoints)
    .withConcurrency(16)
    .process(async (datapoint): Promise<Prediction> => {
      console.log(`computing predictions for "${datapoint.id}"`);
      // construct the prompt
      const prompt = await strategy.getPrompt(datapoint);
      // get the completion & parse it
      const answer = await api.createCompletion({
        model: "text-davinci-003",
        prompt: prompt.join("\n\n"),
        max_tokens: 512,
        temperature: 0,
        n: 1,
      });
      const completion = await strategy.parseCompletion(datapoint, answer.data.choices[0]?.text ?? "");
      // construct the ground truth
      const groundTruthContent = (await datapoint.loadFile("ground-truth.json")).toString("utf-8");
      const groundTruthParsed = z.record(z.array(z.string())).parse(JSON.parse(groundTruthContent));
      const groundTruth = Object.entries(groundTruthParsed).reduce(
        (acc, [k, v]) => (knownLabels.includes(k) ? { ...acc, [k]: v[0]! } : acc),
        knownLabels.reduce((acc, label) => ({ ...acc, [label]: null }), {} as Record<string, string | null>)
      );
      // construct the predicted
      const predicted = Object.entries(completion).reduce(
        (acc, [k, v]) => (knownLabels.includes(k) ? { ...acc, [k]: v ?? null } : acc),
        knownLabels.reduce((acc, label) => ({ ...acc, [label]: null }), {} as Record<string, string | null>)
      );
      return { id: datapoint.id, predicted, groundTruth };
    });
  if (errors.length > 0) {
    throw errors[0]?.raw;
  }
  // evaluate the results
  type Evaluation = {
    meta: {
      datapoints: string[];
      dataset: string;
      limit: number | null;
      seed: string;
      strategy: string;
      timestamp: string;
    };
    aggregated: { f1: number; recall: number; precision: number };
    by_label: { label: string; f1: number; recall: number; precision: number }[];
    missed: { id: string; label: string; groundTruth: string | null; predicted: string | null }[];
  };
  const matcher = (label: string, a: string, b: string): boolean => {
    if (label === "DATE") {
      const match = compareDates()(a, b);
      return match;
    }
    if (label == "TOTAL") {
      const match = compareNumbers()(a, b);
      return match;
    }
    const match = compareStrings(Math.ceil(0.2 * Math.max(a.length, b.length)))(a, b);
    return match;
  };
  const now = new Date();
  const evaluation: Evaluation = {
    meta: {
      datapoints: datapoints.map((d) => d.id),
      dataset: dataset.name,
      limit: args.limit,
      seed: args.seed,
      strategy: strategy.name,
      timestamp: now.toISOString(),
    },
    aggregated: {
      f1: computeF1Score(
        predictions.map((r) => r.predicted),
        predictions.map((r) => r.groundTruth),
        matcher
      ),
      recall: computeRecall(
        predictions.map((r) => r.predicted),
        predictions.map((r) => r.groundTruth),
        matcher
      ),
      precision: computePrecision(
        predictions.map((r) => r.predicted),
        predictions.map((r) => r.groundTruth),
        matcher
      ),
    },
    by_label: knownLabels.map((label) => {
      const predicted = predictions.map((r) =>
        Object.entries(r.predicted)
          .filter(([l]) => l === label)
          .reduce((acc, [key, v]) => ({ ...acc, [key]: v }), {} as Record<string, string | null>)
      );
      const groundTruth = predictions.map((r) =>
        Object.entries(r.groundTruth)
          .filter(([l]) => l === label)
          .reduce((acc, [key, v]) => ({ ...acc, [key]: v }), {} as Record<string, string | null>)
      );
      return {
        label: label,
        f1: computeF1Score(predicted, groundTruth, matcher),
        precision: computePrecision(predicted, groundTruth, matcher),
        recall: computeRecall(predicted, groundTruth, matcher),
      };
    }),
    missed: predictions.flatMap(({ id, groundTruth, predicted }) => {
      const missed: { id: string; label: string; groundTruth: string | null; predicted: string | null }[] = [];
      for (const label of knownLabels) {
        if (!matcher(label, groundTruth[label] ?? "", predicted[label] ?? "")) {
          missed.push({ id, label, groundTruth: groundTruth[label] ?? null, predicted: predicted[label] ?? null });
        }
      }
      return missed;
    }),
  };
  const printEvalResult = (prefix: string, result: { f1: number; recall: number; precision: number }) => {
    const f1Str = result.f1.toFixed(3);
    const recallStr = result.recall.toFixed(3);
    const precisionStr = result.precision.toFixed(3);
    const _prefix = `${prefix}:`.padEnd(16, " ");
    console.log(`${_prefix}f1-score (${f1Str}), recall (${recallStr}), precision (${precisionStr})`);
  };
  console.log("evaluation completed");
  console.log(`========`);
  printEvalResult("aggregated", evaluation.aggregated);
  console.log(`--------`);
  evaluation.by_label.forEach((result) => printEvalResult(`for ${result.label}`, result));
  // store the evaluations to a file
  await fs.writeFile(
    path.resolve("evaluations", `eval-${dataset.name}-${strategy.name}-${now.toISOString()}.json`),
    JSON.stringify(evaluation, null, 2),
    { encoding: "utf-8" }
  );
}

runSafely(main);
