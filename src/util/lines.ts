interface TextSegment {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function sortToReadingOrder<T extends TextSegment>(segments: T[]): T[] {
  let pool = [...segments];
  function pick(): T {
    if (pool.length === 0) throw new Error("cannot pick from an empty segment pool");
    // step 1: find the top-most item
    const topMostItem = pool.reduce((current, segment) => (segment.y <= current.y ? segment : current), pool[0]!);
    // step 2: find the segments on the same line as the top most
    const firstLine = pool.filter(
      (segment) =>
        Math.abs(segment.y + 0.5 * segment.height - (topMostItem.y + 0.5 * topMostItem.height)) <
        topMostItem.height * 0.33
    );
    // step 3: select the left-most from the top-most line
    const leftMostItem = firstLine.reduce(
      (current, segment) => (segment.x < current.x ? segment : current),
      firstLine[0]!
    );
    // step 4: remove it from pool
    pool = pool.filter((segment) => segment !== leftMostItem);
    return leftMostItem;
  }
  const result: T[] = [];
  while (pool.length > 0) {
    result.push(pick());
  }
  return result;
}

export function splitToLines<T extends TextSegment>(segments: T[]): T[][] {
  const lines: T[][] = [];
  // push the first line to avoid the cold start problem
  if (segments.length === 0) return lines;
  lines.push([segments[0]!]);
  // continue from the second text segment
  for (let i = 1; i < segments.length; i += 1) {
    const prev = lines.at(-1)?.at(-1);
    if (!prev) throw new Error("expected previous value to be defined");
    const curr = segments[i]!;
    // case 1: if the segment starts horisontally "on top" of the previous segment
    const boundX = prev.x + 0.9 * prev.width;
    if (curr.x < boundX) {
      lines.push([curr]);
      continue;
    }
    // case 2: if the segment is clearly below the previous one
    const boundY = prev.y + 0.9 * prev.height;
    if (curr.y > boundY) {
      lines.push([curr]);
      continue;
    }
    // otherwise, push on the current line
    lines.at(-1)!.push(curr);
  }
  return lines;
}
