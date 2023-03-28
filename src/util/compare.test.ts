import { describe } from "@jest/globals";
import { compareDates, compareNumbers, compareStrings } from "./compare";

describe("compare", () => {
  describe("dates", () => {
    const tt: {
      name: string;
      a: string | null;
      b: string | null;
      match: boolean;
    }[] = [
      {
        name: "null === null",
        a: null,
        b: null,
        match: true,
      },
      {
        name: '"21.02.2023" === null',
        a: "21.02.2023",
        b: null,
        match: false,
      },
      {
        name: '"21.02.2023" === "21.2.2023"',
        a: "21.02.2023",
        b: "21.2.2023",
        match: true,
      },
      {
        name: '"01.02.2023" === "1.2.2023"',
        a: "21.02.2023",
        b: "21.2.2023",
        match: true,
      },
      {
        name: '"21.02.2023" === "2023-02-21"',
        a: "21.02.2023",
        b: "2023-02-21",
        match: true,
      },
      {
        name: '"21.02.23" === "2023-02-21"',
        a: "21.02.23",
        b: "2023-02-21",
        match: true,
      },
      {
        name: '"21 . 02 . 23" === "2023-02-21"',
        a: "21 . 02 . 23",
        b: "2023-02-21",
        match: true,
      },
      {
        name: '"21-2 2023" === "2023-02-21"',
        a: "21-2 2023",
        b: "2023-02-21",
        match: true,
      },
      {
        name: '"15.11 2021" === "2021-11-15"',
        a: "15.11 2021",
        b: "2021-11-15",
        match: true,
      },
      {
        name: '"21-02-2023" === "2023-02-21"',
        a: "21-02-2023",
        b: "2023-02-21",
        match: true,
      },
      {
        name: '"some text 21.02.2023 around" === "2023-02-21"',
        a: "some text 21.02.2023 around",
        b: "2023-02-21",
        match: true,
      },
      {
        name: '"2023/02/21" === "21.2.2023"',
        a: "2023/02/21",
        b: "21.2.2023",
        match: true,
      },
      {
        name: '"21/02/2023" === "21.2.2023"',
        a: "21/02/2023",
        b: "21.2.2023",
        match: true,
      },
    ];
    for (const tc of tt) {
      it(tc.name, () => {
        expect(compareDates()(tc.a, tc.b)).toBe(tc.match);
      });
    }
  });

  describe("numbers", () => {
    const tt: {
      name: string;
      a: string | null;
      b: string | null;
      match: boolean;
    }[] = [
      {
        name: "null === null",
        a: null,
        b: null,
        match: true,
      },
      {
        name: '"42" === null',
        a: "42",
        b: null,
        match: false,
      },
      {
        name: '"42" === "42"',
        a: "42",
        b: "42",
        match: true,
      },
      {
        name: '"42" === "42.00"',
        a: "42",
        b: "42.00",
        match: true,
      },
      {
        name: '"42 13.72" === "42.00"',
        a: "42 13.72",
        b: "42.00",
        match: true,
      },
      {
        name: '"13.72 42" === "42.00"',
        a: "13.72 42",
        b: "42.00",
        match: true,
      },
      {
        name: '"12,49" === "12.49"',
        a: "12,49",
        b: "12.49",
        match: true,
      },
      {
        name: '"12,40 EUR" === "12.4"',
        a: "12,40 EUR",
        b: "12.4",
        match: true,
      },
      {
        name: '"$12,40" === "12.4"',
        a: "$12,40",
        b: "12.4",
        match: true,
      },
    ];
    for (const tc of tt) {
      it(tc.name, () => {
        expect(compareNumbers()(tc.a, tc.b)).toBe(tc.match);
      });
    }
  });

  describe("strings", () => {
    const tt: {
      name: string;
      a: string | null;
      b: string | null;
      maxEdits: number;
      match: boolean;
    }[] = [
      {
        name: "null === null",
        a: null,
        b: null,
        maxEdits: 0,
        match: true,
      },
      {
        name: '"hello" === null',
        a: "hello",
        b: null,
        maxEdits: 0,
        match: false,
      },
      {
        name: '"hello" === "hello"',
        a: "hello",
        b: "hello",
        maxEdits: 0,
        match: true,
      },
      {
        name: '"hello " === " hello"',
        a: "hello ",
        b: " hello",
        maxEdits: 0,
        match: true,
      },
      {
        name: '"helloo" === "hello"',
        a: "helloo",
        b: "hello",
        maxEdits: 0,
        match: false,
      },
      {
        name: '"helloo" === "hello"',
        a: "helloo",
        b: "hello",
        maxEdits: 1,
        match: true,
      },
      {
        name: '"HELLO" === "hello"',
        a: "HELLO",
        b: "hello",
        maxEdits: 0,
        match: true,
      },
    ];
    for (const tc of tt) {
      it(tc.name, () => {
        expect(compareStrings(tc.maxEdits)(tc.a, tc.b)).toBe(tc.match);
      });
    }
  });
});
