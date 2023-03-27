function computeCounts(
  predictions: Record<string, string | null>[],
  targets: Record<string, string | null>[],
  matcher?: (label: string, a: string, b: string) => boolean
): { tp: number; fp: number; fn: number } {
  if (predictions.length !== targets.length) {
    throw new Error("predictions and targets must have the exact same length");
  }
  let [tp, fp, fn] = [0, 0, 0];
  for (let i = 0; i < predictions.length; i += 1) {
    const [prediction, target] = [predictions[i]!, targets[i]!];
    for (const key of Object.keys(target)) {
      const [predictionValue, targetValue] = [prediction[key], target[key]];
      if (!predictionValue && !targetValue) {
        // no target nor a prediction -> true negative
        continue;
      }
      if (!predictionValue && targetValue && targetValue.length > 0) {
        // there was a target but no prediction -> false negative
        fn += 1;
        continue;
      }
      if (predictionValue && predictionValue.length > 0 && !targetValue) {
        // there was a prediction but no target -> false positive
        fp += 1;
        continue;
      }
      if (!predictionValue || !targetValue) {
        throw new Error("expected both the prediction value and target value to be present");
      }
      const isMatch = matcher ? matcher(key, predictionValue, targetValue) : predictionValue === targetValue;
      if (isMatch) {
        // the prediction matched the target -> true positive
        tp += 1;
      } else {
        // the prediction did not match the target -> false positive + false negative
        fp += 1;
        fn += 1;
      }
    }
  }
  return { tp, fp, fn };
}

export function computePrecision(
  predictions: Record<string, string | null>[],
  targets: Record<string, string | null>[],
  matcher?: (label: string, a: string, b: string) => boolean
): number {
  const { tp, fp } = computeCounts(predictions, targets, matcher);
  return tp / (tp + fp + 1e-12);
}

export function computeRecall(
  predictions: Record<string, string | null>[],
  targets: Record<string, string | null>[],
  matcher?: (label: string, a: string, b: string) => boolean
): number {
  const { tp, fn } = computeCounts(predictions, targets, matcher);
  return tp / (tp + fn + 1e-12);
}

export function computeF1Score(
  predictions: Record<string, string | null>[],
  targets: Record<string, string | null>[],
  matcher?: (label: string, a: string, b: string) => boolean
): number {
  const { tp, fp, fn } = computeCounts(predictions, targets, matcher);
  return tp / (tp + 0.5 * (fp + fn) + 1e-12);
}
