import { parse as parseCSV } from "csv-parse/sync";
import fs from "node:fs/promises";
import path from "node:path";
import { runSafely } from "../util";

function isTrainSample(_id: string): boolean {
  // TODO: implement this
  return false;
}

function annotationsToGroundTruth(annotations: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const rows = parseCSV(annotations, { delimiter: ";", columns: false });
  for (const row of rows) {
    if (row.length === 0) continue;
    const [, , , , text, iobLabel] = row;
    const [tag, label] = iobLabel?.split("-") ?? [];
    if (tag === "O") continue;
    if (!text || !tag || !label) throw new Error("expected an annotation row to be of known format");
    result[label] = result[label] ?? [];
    if (tag === "B") {
      result[label]!.push(text);
    } else if (tag === "I") {
      const idx = result[label]!.length - 1;
      result[label]![idx] = result[label]![idx]! + " " + text;
    }
  }
  return result;
}

type CloudVisionTextSegment = {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  label: string;
};

function annotationsToCloudVision(annotations: string): CloudVisionTextSegment[] {
  const labels = ["DATE", "TOTAL", "COMPANY", "ADDRESS"];
  const result: CloudVisionTextSegment[] = [];
  const rows = parseCSV(annotations, { delimiter: ";", columns: false });
  for (const row of rows) {
    if (row.length === 0) continue;
    const [x, y, width, height, text, iobLabel] = row;
    const [tag, label] = iobLabel?.split("-") ?? [];
    if (!x || !y || !width || !height || !text || !tag || (tag !== "O" && !label)) {
      throw new Error("expected an annotation row to be of known format");
    }
    result.push({
      x: parseFloat(x),
      y: parseFloat(y),
      width: parseFloat(width),
      height: parseFloat(height),
      text: text,
      label: tag === "O" ? "OTHER" : labels.includes(label) ? label : "OTHER",
    });
  }
  return result;
}

async function main() {
  // go through every image
  const images = await fs.readdir(path.resolve("bucket", "custom", "original"), {
    encoding: "utf-8",
    withFileTypes: true,
  });
  for (const image of images) {
    if (!image.isFile()) {
      continue;
    }
    // read in the image and its annotations
    const id = image.name.split(path.extname(image.name))[0];
    if (!id) throw new Error("expected to be able to parse the id");
    try {
      await fs.access(path.resolve("bucket", "custom", "annotated", `${id}.csv`));
    } catch (error) {
      // file does not exist, skip...
      continue;
    }
    const imageContent = await fs.readFile(path.resolve("bucket", "custom", "original", image.name));
    const annotationContent = await fs.readFile(path.resolve("bucket", "custom", "annotated", `${id}.csv`));
    // write the files to the `data` folder
    await fs.mkdir(path.resolve("data", "custom", "train"), { recursive: true });
    await fs.mkdir(path.resolve("data", "custom", "eval"), { recursive: true });
    const basePath = path.resolve("data", "custom", isTrainSample(id) ? "train" : "eval");
    await fs.mkdir(path.resolve(basePath, id));
    // write the image
    await fs.writeFile(path.resolve(basePath, id, `image${path.extname(image.name)}`), imageContent);
    // write the annotations
    await fs.writeFile(
      path.resolve(basePath, id, `ground-truth.json`),
      JSON.stringify(annotationsToGroundTruth(annotationContent.toString("utf-8")))
    );
    await fs.writeFile(
      path.resolve(basePath, id, `cloud-vision.json`),
      JSON.stringify(annotationsToCloudVision(annotationContent.toString("utf-8")))
    );
  }
}

runSafely(main);
