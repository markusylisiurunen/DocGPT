import leven from "leven";

export function compareDates() {
  return (a: string | null, b: string | null): boolean => {
    // normalize the `21.02.2023` format
    function normalize1(value: string): string {
      const [date, month, year] = value.split(".").flatMap((v) => v.trim().split(" "));
      if (!date || !month || !year) {
        throw new Error('expected date to be in the "21.02.2023" format');
      }
      return [year.trim(), month.trim().padStart(2, "0"), date.trim().padStart(2, "0")].join("-");
    }
    // normalize the `2023/02/21` format
    function normalize2(value: string): string {
      const [year, month, date] = value.split("/");
      if (!date || !month || !year) {
        throw new Error('expected date to be in the "2023/02/21" format');
      }
      return [year.trim(), month.trim().padStart(2, "0"), date.trim().padStart(2, "0")].join("-");
    }
    // normalize the `21/02/2023` format
    function normalize3(value: string): string {
      const [date, month, year] = value.split("/");
      if (!date || !month || !year) {
        throw new Error('expected date to be in the "21/02/2023" format');
      }
      return [year.trim(), month.trim().padStart(2, "0"), date.trim().padStart(2, "0")].join("-");
    }
    // normalize the `2023-02-21` format
    function normalize4(value: string): string {
      const [year, month, date] = value.split("-").flatMap((v) => v.trim().split(" "));
      if (!date || !month || !year) {
        throw new Error('expected date to be in the "21-02-2023" format');
      }
      return [year.trim(), month.trim().padStart(2, "0"), date.trim().padStart(2, "0")].join("-");
    }
    // normalize the `21-02-2023` format
    function normalize5(value: string): string {
      const [date, month, year] = value.split("-").flatMap((v) => v.trim().split(" "));
      if (!date || !month || !year) {
        throw new Error('expected date to be in the "21-02-2023" format');
      }
      return [year.trim(), month.trim().padStart(2, "0"), date.trim().padStart(2, "0")].join("-");
    }
    // normalize the `21.02.23` format
    function normalize6(value: string): string {
      const [date, month, year] = value.split(".").flatMap((v) => v.trim().split(" "));
      if (!date || !month || !year) {
        throw new Error('expected date to be in the "21.02.23" format');
      }
      return [
        parseInt(year.trim(), 10) >= 20
          ? (2000 + parseInt(year.trim(), 10)).toString()
          : (1900 + parseInt(year.trim(), 10)).toString(),
        month.trim().padStart(2, "0"),
        date.trim().padStart(2, "0"),
      ].join("-");
    }
    // normalize any known format
    function normalizeAny(value: string): string | null {
      const [, one] = value.match(/([0-9]{1,2}(?:(\s?\.\s?)|\s)[0-9]{1,2}(?:(\s?\.\s?)|\s)[0-9]{4})/) ?? [];
      if (one) {
        try {
          return normalize1(one);
        } catch (error) {
          return null;
        }
      }
      const [, two] = value.match(/([0-9]{4}\s?\/\s?[0-9]{1,2}\s?\/\s?[0-9]{1,2})/) ?? [];
      if (two) {
        try {
          return normalize2(two);
        } catch (error) {
          return null;
        }
      }
      const [, three] = value.match(/([0-9]{1,2}\s?\/\s?[0-9]{1,2}\s?\/\s?[0-9]{4})/) ?? [];
      if (three) {
        try {
          return normalize3(three);
        } catch (error) {
          return null;
        }
      }
      const [, four] = value.match(/([0-9]{4}(?:-|\s)[0-9]{2}(?:-|\s)[0-9]{2})/) ?? [];
      if (four) {
        try {
          return normalize4(four);
        } catch (error) {
          return null;
        }
      }
      const [, five] = value.match(/([0-9]{1,2}(?:-|\s)[0-9]{1,2}(?:-|\s)[0-9]{4})/) ?? [];
      if (five) {
        try {
          return normalize5(five);
        } catch (error) {
          return null;
        }
      }
      const [, six] = value.match(/([0-9]{1,2}(?:(\s?\.\s?)|\s)[0-9]{1,2}(?:(\s?\.\s?)|\s)[0-9]{2})/) ?? [];
      if (six) {
        try {
          return normalize6(six);
        } catch (error) {
          return null;
        }
      }
      return null;
    }
    // compare
    if (a === null) return b === null;
    if (b === null) return a === null;
    const isMatch = normalizeAny(a) === normalizeAny(b);
    return isMatch;
  };
}

export function compareNumbers() {
  return (a: string | null, b: string | null): boolean => {
    function normalizeAny(value: string): string | null {
      const numberRegexp = new RegExp(/([0-9]{1,}(?:\s?(\,|\.)\s?[0-9]{1,2})?)/, "g");
      const candidates: string[] = [];
      while (true) {
        const match = numberRegexp.exec(value);
        if (!match) break;
        if (match[1]) {
          candidates.push(match[1]!);
        }
      }
      const num = Math.max(-1, ...candidates.flatMap((c) => parseFloat(c.replaceAll(" ", "").replaceAll(",", "."))));
      return num === -1 ? null : (num * 100).toString();
    }
    // compare
    if (a === null) return b === null;
    if (b === null) return a === null;
    const isMatch = normalizeAny(a) === normalizeAny(b);
    return isMatch;
  };
}

export function compareStrings(maxEditDistance?: number) {
  return (a: string | null, b: string | null): boolean => {
    function normalizeAny(value: string): string {
      return value.trim().toLowerCase();
    }
    // compare
    if (a === null) return b === null;
    if (b === null) return a === null;
    const distance = leven(normalizeAny(a), normalizeAny(b));
    const threshold = maxEditDistance ?? Math.ceil(0.1 * ((a.length + b.length) / 2));
    return distance <= threshold;
  };
}
