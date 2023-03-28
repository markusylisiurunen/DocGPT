import { z } from "zod";
import type { LazyDataPoint } from "../../fs";
import type { ParsedCompletion, PromptStrategy } from "../types";

const CloudVisionTextSegment = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  text: z.string(),
  label: z.string(),
});
type CloudVisionTextSegment = z.infer<typeof CloudVisionTextSegment>;

function formatWithoutLabel(text: CloudVisionTextSegment): string {
  const [x, y] = [Math.round(text.x * 1000), Math.round(text.y * 1000)];
  return `{txt:"${text.text}",box:[${x},${y}]}`;
}

function formatWithBoxAndLabel(text: CloudVisionTextSegment, label: string): string {
  const [x, y] = [Math.round(text.x * 1000), Math.round(text.y * 1000)];
  return `{txt:"${text.text}",box:[${x},${y}],label:"${label}"}`;
}

function formatWithLabel(text: CloudVisionTextSegment, label: string): string {
  return `{txt:"${text.text}",label:"${label}"}`;
}

function selectTextSegment(
  words: CloudVisionTextSegment[],
  segments: { prefix: string; words: number }[]
): CloudVisionTextSegment[] {
  const selectedWords: CloudVisionTextSegment[] = [];
  // find the requested segments from the Cloud Vision words
  for (const segment of segments) {
    for (let startIdx = 0; startIdx < words.length; startIdx += 1) {
      for (let length = 1; length < 12; length += 1) {
        const currentSlice = words
          .slice(startIdx, startIdx + length)
          .map((w) => w.text)
          .join(" ")
          .toLowerCase();
        if (!segment.prefix.toLowerCase().startsWith(currentSlice)) {
          break;
        }
        if (currentSlice === segment.prefix.toLowerCase()) {
          const wordsToFormat = words.slice(startIdx, startIdx + segment.words);
          selectedWords.push(...wordsToFormat);
          break;
        }
      }
    }
  }
  return selectedWords;
}

async function constructHardDemonstration(
  dataPoint: LazyDataPoint,
  segments: { prefix: string; words: number }[]
): Promise<{ context: string }> {
  const cloudVision = (await dataPoint.loadFile("cloud-vision.json")).toString("utf-8");
  const words = z.array(CloudVisionTextSegment).parse(JSON.parse(cloudVision));
  // select the requested segments
  const selectedWords = selectTextSegment(words, segments);
  // construct the context
  return {
    context: `${selectedWords.map((w) => formatWithBoxAndLabel(w, w.label)).join("")}`,
  };
}

async function constructFormattingDemonstration(
  dataPoint: LazyDataPoint,
  segments: { prefix: string; words: number }[]
): Promise<{ question: string; answer: string }> {
  const cloudVision = (await dataPoint.loadFile("cloud-vision.json")).toString("utf-8");
  const words = z.array(CloudVisionTextSegment).parse(JSON.parse(cloudVision));
  // select the requested segments
  const selectedWords = selectTextSegment(words, segments);
  // construct the question and answer
  const formattedWords: string[] = [];
  const formattedLabels: string[] = [];
  formattedWords.push(...selectedWords.map((w) => formatWithoutLabel(w)));
  formattedLabels.push(...selectedWords.map((w) => formatWithLabel(w, w.label)));
  return {
    question: `${formattedWords.join("")}, What are the labels for these texts?`,
    answer: formattedLabels.join(""),
  };
}

// https://arxiv.org/pdf/2303.05063.pdf
export function makeICLD3IEStrategy(): PromptStrategy {
  const config = {
    labels: [
      {
        name: "DATE",
        description: "The date (not including time) when the purchase was made.",
      },
      {
        name: "TOTAL",
        description: "The total amount that was paid.",
      },
      {
        name: "COMPANY",
        description: "The full name, including the location shop's location, of the vendor the purchase was made from.",
      },
      {
        name: "ADDRESS",
        description: "The address where the vendor is located at. Usually includes street, postal code and city.",
      },
      {
        name: "OTHER",
        description: "Any other text segment not assignable to other labels.",
      },
    ],
  };
  // store the demonstrations constructed on init
  const demonstrations: {
    hard: { context: string }[];
    formatting: { question: string; answer: string }[];
  } = {
    hard: [],
    formatting: [],
  };
  return {
    async init(dataset) {
      const dataPoints = await dataset.listDataPoints("eval");
      // hard demo 1: a receipt from K-Supermarket Redi
      const hardDemo1DataPoint = dataPoints.find((p) => p.id === "markusy_0aa9d69d0ef00204f79ac909e98b7d8823d1f744");
      const hardDemo1 = await constructHardDemonstration(hardDemo1DataPoint!, [
        { prefix: "K - Supermarket Redt", words: 12 },
      ]);
      // hard demo 2: a receipt from K-Supermarket Redi
      const hardDemo2DataPoint = dataPoints.find((p) => p.id === "markusy_0aa9d69d0ef00204f79ac909e98b7d8823d1f744");
      const hardDemo2 = await constructHardDemonstration(hardDemo2DataPoint!, [
        { prefix: "Credit / Veloitus", words: 8 },
      ]);
      // hard demo 3: a receipt from K-Supermarket Redi
      const hardDemo3DataPoint = dataPoints.find((p) => p.id === "markusy_0aa9d69d0ef00204f79ac909e98b7d8823d1f744");
      const hardDemo3 = await constructHardDemonstration(hardDemo3DataPoint!, [
        { prefix: "valk.40L muovika 0,22", words: 8 },
      ]);
      // format demo 1: a receipt from Pyörätaikurit
      const formatDemo1DataPoint = dataPoints.find((p) => p.id === "reaktor_daca65db56f1bc1bb4ea39ba69efffe26073b578");
      const formatDemo1 = await constructFormattingDemonstration(formatDemo1DataPoint!, [
        { prefix: "PYORATAIKURIT www.pyorata", words: 12 },
      ]);
      // format demo 2: a receipt from Pyörätaikurit
      const formatDemo2DataPoint = dataPoints.find((p) => p.id === "reaktor_daca65db56f1bc1bb4ea39ba69efffe26073b578");
      const formatDemo2 = await constructFormattingDemonstration(formatDemo2DataPoint!, [
        { prefix: "laskettelu suk", words: 8 },
      ]);
      demonstrations.hard.push(hardDemo1, hardDemo2, hardDemo3);
      demonstrations.formatting.push(formatDemo1, formatDemo2);
    },
    async getPrompt(dataPoint) {
      // read in the Cloud Vision output
      const cloudVision = (await dataPoint.loadFile("cloud-vision.json")).toString("utf-8");
      const words = z.array(CloudVisionTextSegment).parse(JSON.parse(cloudVision));
      // construct the prompt(s)
      const messages: string[] = [];
      // (a) label mapping
      const labelNames = config.labels.map((label) => `"${label.name}"`).join(", ");
      messages.push(
        [
          [
            `Your task is to extract information from a receipt.`,
            `You will be given a list of words and their x- and y-coordinates (within 0-1000), and you should label each word.`,
            `There are ${config.labels.length} labels for selection: ${labelNames}.`,
          ].join(" "),
          config.labels.map((label) => `- ${label.name}: ${label.description}`).join("\n"),
        ].join("\n\n")
      );
      // (b) hard demonstrations
      messages.push([...demonstrations.hard.map((demo) => `Context: ${demo.context}`)].join("\n\n"));
      // (c) layout-aware demonstrations TODO:
      // (d) formatting demonstrations
      messages.push(
        [...demonstrations.formatting.map((demo) => `Q: ${demo.question}\nA: ${demo.answer}`)].join("\n\n")
      );
      // (e) prompt for the current document
      messages.push(`Q: ${words.map((w) => formatWithoutLabel(w))}, What are the labels for these texts?`);
      // return the messages
      return messages;
    },

    async parseCompletion(_dataPoint, completion) {
      const result: ParsedCompletion = {};
      const wordRegex = new RegExp(/\{(.+?)\}/, "g");
      while (true) {
        let match = wordRegex.exec(completion);
        if (match === null) break;
        if (!match[1]) continue;
        const textLabelRegex = new RegExp(/txt:"(.+?)",label:"(.+?)"/);
        match = textLabelRegex.exec(match[1]);
        if (match === null) continue;
        const [text, label] = [match[1], match[2]];
        if (!text || !label || label === "OTHER") continue;
        if (!(label in result)) {
          result[label] = text;
        } else {
          result[label] += ` ${text}`;
        }
      }
      return result;
    },
  };
}
