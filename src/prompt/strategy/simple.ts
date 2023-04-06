import { z } from "zod";
import type { PromptStrategy } from "../types";

const builder = {
  divider: () => {
    return "";
  },
  paragraph: (...sentences: string[]) => {
    return sentences.join(" ");
  },
  lines: (...lines: string[]) => {
    return lines.join("\n");
  },
  context: (...texts: (string | { text: string })[]) => {
    const _texts = texts.map((t) => (typeof t === "string" ? t : t.text));
    return "Context: " + _texts.map((t) => `"${t.replaceAll('"', "")}"`).join(",");
  },
  question: (question: string) => {
    return "Q: " + question;
  },
  textAnswer: (answer: string) => {
    return "A: " + answer;
  },
  jsonAnswer: (fields: { total?: string; date?: string; company?: string; address?: string }) => {
    return (
      "A: " +
      JSON.stringify({
        total: fields.total ?? null,
        date: fields.date ?? null,
        company: fields.company ?? null,
        address: fields.address ?? null,
      })
    );
  },
};

export function makeSimplePromptStrategy(): PromptStrategy {
  return {
    name: "simple",
    async init() {
      return;
    },
    async getPrompt(dataPoint) {
      // read in the Cloud Vision output
      const cloudVision = (await dataPoint.loadFile("cloud-vision.json")).toString("utf-8");
      const words = z.array(z.object({ text: z.string() })).parse(JSON.parse(cloudVision));
      // construct the prompt line by line
      // prettier-ignore
      const question = builder.lines(
        // label mapping
        builder.paragraph(
          `Given a list of OCR text segments as context, you should respond with JSON having following fields: "total", "date", "company", "address".`,
          `Do not include any other fields.`,
          `Field values can only include preceding text segments joined together.`,
          `For example, given "A", "B", and "C", "A B" and "B C" are valid but "A C" is not.`,
        ),
        builder.divider(),
        builder.question(`What can be labeled "total"?`),
        builder.textAnswer(`Text that indicates the total amount that was paid on the receipt. Currency is usually Euros.`),
        builder.question(`What can be labeled "date"?`),
        builder.textAnswer(`Text that indicates a specific date, such as year, month and day. Formats like "dd.MM.yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "dd/MM/yyy", and so on.`),
        builder.question(`What can be labeled as "company"?`),
        builder.textAnswer(`Text that indicates the name of the company which issued the receipt.`),
        builder.question(`What can be labeled as "address"?`),
        builder.textAnswer(`Text that indicates a physical location such as street name, city, country, postal code, etc. Cannot be a fax, phone number, or any other ID.`),
        // address examples
        builder.divider(),
        builder.lines(`Examples of text labeled as "address":`),
        ...[
          `Finnoonlaaksontie 1-5 , 02270 Espoo`,
          `HÄMEENTIE 13B 00530 HELSINKI`,
          `Helsinki Ullanlinna`,
          `Mannerheimintie 5 00100 HELSINKI`,
          `Hermannin rantatie 5 00580 Helsinki`,
          `Eteläesplanadi 8`,
          `MARIANKATU 19 00170 TAMPERE`,
          `Laivalahdenkatu 1 00810 Turku`,
        ].map(t => `- ${t}`),
        // company examples
        builder.divider(),
        builder.lines(`Examples of text labeled as "company":`),
        ...[
          `RAVINTOLA KOREA HOUSE`,
          `PRISMA HERTTONIEMI`,
          `SALE HÄMEENKATU`,
          `K - Supermarket Redi`,
          `McDonald's Herttoniemi`,
          `ESPRESSO HOUSE`,
          `Lidl Suomi Ky`,
        ].map(t => `- ${t}`),
        // date examples
        builder.divider(),
        builder.lines(`Examples of text labeled as "date":`),
        ...[
          `6.11.2021`,
          `23.12.2016`,
          `2023-01-27`,
          `16-11-2021`,
          `9-11-2021`,
          `12/9/2020`,
          `1-08-2019`,
        ].map(t => `- ${t}`),
        // hard demonstrations TODO: not sure if these are the best examples, needs iteration...
        builder.divider(),
        builder.context(`PULLOPALAUTUS`, `10,30`, `-`, `YHTEENSÄ`, `25.51`, `KORTTITAPAHTUMA`, `Kortti:`, `Visa`),
        builder.jsonAnswer({ total: `25.51` }),
        builder.divider(),
        builder.context(`Yritys`, `/`, `Ala:`, `01837/5411`, `Credit`, `/`, `Veloitus`, `25,51`, `EUR`, `Visa`, `Contactless`),
        builder.jsonAnswer({ total: `25,51` }),
        builder.divider(),
        builder.context(`K`, `-`, `Citymarket`, `Turku`, `Kupittaa`, `Avoinna`, `joka`, `päivä`, `24`, `h`, `Uudenmaantie`, `17`, `,`, `20700`, `Turku`, `kaupat`, `-`),
        builder.jsonAnswer({ company: `K - Citymarket Turku Kupittaa`, address: `Uudenmaantie 17 , 20700 Turku` }),
        builder.divider(),
        builder.context(`PRISMA`, `HERTTONIEMI`, `010`, `7657`, `100`, `(0,0835`, `e`, `/`, `puh+0,`, `1209`, `e/min)`, `HOK-Elanto`, `Liiketoiminta`, `Oy,`, `1837957-3`, `4`, `K4`, `M000101`, `/`, `4392`, `20:51`, `9-11-2021`, `RED`, `CURRY`, `WITH`),
        builder.jsonAnswer({ company: "PRISMA HERTTONIEMI", date: "9-11-2021" }),
        // the actual user-provided prompt
        builder.divider(),
        builder.context(...words),
        `A:`,
      );
      return [question];
    },
    async parseCompletion(_dataPoint, completion) {
      const codeBlockRegExp = new RegExp("(\\{.+\\})", "s");
      const matches = completion.match(codeBlockRegExp);
      // check if the match included a JSON code block
      const [, code] = matches ?? [];
      if (code) {
        // try to parse the code block as JSON
        const totalSchema = z.object({ total: z.number().or(z.string()).nullable() });
        const dateSchema = z.object({ date: z.string().nullable() });
        const companySchema = z.object({ company: z.string().nullable() });
        const addressSchema = z.object({ address: z.string().nullable() });
        try {
          const asJSON = JSON.parse(code);
          // ---
          const total = totalSchema.safeParse(asJSON);
          const date = dateSchema.safeParse(asJSON);
          const company = companySchema.safeParse(asJSON);
          const address = addressSchema.safeParse(asJSON);
          // ---
          const TOTAL = total.success ? total.data.total?.toString() ?? null : null;
          const DATE = date.success ? date.data.date ?? null : null;
          const ADDRESS = address.success ? address.data.address ?? null : null;
          const COMPANY = company.success ? company.data.company ?? null : null;
          return { TOTAL, DATE, COMPANY, ADDRESS };
        } catch (error) {
          return {};
        }
      }
      return {};
    },
  };
}
