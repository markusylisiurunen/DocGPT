import { z } from "zod";
import { sortToReadingOrder, splitToLines } from "../../util/lines";
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
  labels: (fields: {
    total?: string;
    vat10?: string;
    vat14?: string;
    vat24?: string;
    date?: string;
    company?: string;
    address?: string;
  }) => {
    return (
      "Labels: " +
      JSON.stringify({
        total: fields.total ?? null,
        vat_10: fields.vat10 ?? null,
        vat_14: fields.vat14 ?? null,
        vat_24: fields.vat24 ?? null,
        date: fields.date ?? null,
        company: fields.company ?? null,
        address: fields.address ?? null,
      })
    );
  },
  question: (question: string) => {
    return "Q: " + question;
  },
  answer: (answer: string) => {
    return "A: " + answer;
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
      const words = z
        .array(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), text: z.string() }))
        .parse(JSON.parse(cloudVision));
      const lines = splitToLines(sortToReadingOrder(words));
      // construct the prompt line by line
      // prettier-ignore
      const question = builder.lines(
        // label mapping
        builder.paragraph(
          `Given a list of OCR text segments as context, you should respond with JSON having following fields: "total", "date", "company", "address", "vat_10", "vat_14", "vat_24".`,
          `Do not include any other fields.`,
          `Field values can only include preceding text segments joined together.`,
          `For example, given "A","b","C" as context, "A b" and "b C" are valid but "A C" is not.`,
          `"[LINE]" indicates a line break.`,
        ),
        builder.divider(),
        builder.question(`What can be labeled "total"?`),
        builder.answer(`Text that indicates the total amount that was paid on the receipt. Currency is usually Euros.`),
        builder.question(`What can be labeled "date"?`),
        builder.answer(`Text that indicates a specific date, such as year, month and day. Formats like "dd.MM.yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "dd/MM/yyy", and so on.`),
        builder.question(`What can be labeled as "company"?`),
        builder.answer(`Text that indicates the name of the company which issued the receipt. Never includes the business ID.`),
        builder.question(`What can be labeled as "address"?`),
        builder.answer(`Text that indicates a physical location such as street name, city, country, postal code, etc. Cannot be a fax, phone number, or any other ID.`),
        builder.question(`What can be labeled as "vat_10"?`),
        builder.answer(`Text that indicates the portion of the total amount that was under 10 % VAT. Must be the gross amount (net + tax). Usually has the percentage on the same line and is in table section.`),
        builder.question(`What can be labeled as "vat_14"?`),
        builder.answer(`Same as "vat_10" but for 14 % VAT.`),
        builder.question(`What can be labeled as "vat_24"?`),
        builder.answer(`Same as "vat_10" but for 24 % VAT.`),
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
          `Akateeminen Kirjakauppa`,
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
          `24.07.15`,
          `11. 12. 2021`,
        ].map(t => `- ${t}`),
        // hard demonstrations TODO: not sure if these are the best examples, needs iteration...
        builder.divider(),
        // source: 7684e55b4abc699cf4eb57c12ec943ecbe02675a
        builder.context(`PULLOPALAUTUS`, `10,30`, `-`, `[LINE]`, `YHTEENSÄ`, `25.51`, `[LINE]`, `KORTTITAPAHTUMA`, `[LINE]`, `Kortti:`, `Visa`),
        builder.labels({ total: `25.51` }),

        builder.divider(),
        // source: 045339c952ffd24562e672cf00f34e985c51b418
        builder.context(`Yritys`, `/`, `Ala:`, `01837/5411`, `[LINE]`, `Credit`, `/`, `Veloitus`, `25,51`, `EUR`, `[LINE]`, `Visa`, `Contactless`),
        builder.labels({ total: `25,51` }),

        builder.divider(),
        // source: ee9ef3bf21efb59875ad7f7ac35d9fba4298adaa
        builder.context(`YHTEENSÄ`, `EUR`, `76,04`, `[LINE]`, `PANKKIKORTTI`, `76,04`, `[LINE]`, `ALV`, `%`, `NETTO`, `VERO`, `BRUTTO`, `[LINE]`, `10,00`, `33,04`, `3,31`, `C`, `36,35`, `[LINE]`, `14,00`, `27,01`, `3,78`, `D`, `30,79`, `[LINE]`, `24,00`, `7,18`, `1,72`, `B`, `8,90`, `[LINE]`, `YHTEENSÄ`, `67,23`, `8,81`, `76,04`, `[LINE]`, `Veloitus`, `[LINE]`, `76,04`, `EUR`),
        builder.labels({ total: `76,04`, vat10: `36,35`, vat14: `30,79`, vat24: `8,90` }),
        builder.question(`Why is "36,35" labeled "vat_10"?`),
        builder.answer(`Because it is to the right of "ALV 10,00 %" and below "brutto".`),
        builder.question(`Why is "8,90" labeled "vat_24"?`),
        builder.answer(`Because it is to the right of "ALV 24,00 %" and below "brutto".`),

        builder.divider(),
        // source: 2e023e7fee00b2d0116f98d2cd8b6b45cfb8ebfb
        builder.context(`OUT`, `Total`, `(`, `incl`, `VAT`, `)`, `11`, `.90`, `[LINE]`, `TAX`, `%`, `AMOUNT`, `TAX`, `[LINE]`, `INCL.`, `TAX`, `:`, `14.00`, `%`, `11.90`, `1.46`, `[LINE]`, `P??te:`, `16413003`),
        builder.labels({ total: `11.90`, vat14: `11.90` }),
        builder.question(`Why is "11.90" labeled "vat_14"?`),
        builder.answer(`Because it is on the same line with "INCL. TAX" and "14.00%" (which is below "TAX %"), and below "AMOUNT".`),

        builder.divider(),
        // source: 5f34e910e7b5137ad4b747827c5e1409dc653efd
        builder.context(`Credit/Veloitus`, `9.83`, `EUR`, `[LINE]`, `Visa`, `Contactless`, `[LINE]`, `Verified`, `by`, `device`, `[LINE]`, `ALV`, `VEROTON`, `VERO`, `VEROLLINEN`, `[LINE]`, `1`, `24.00%`, `0.32`, `0.08`, `0.40`, `[LINE]`, `4`, `14.00%`, `8.27`, `1.16`, `9.43`, `[LINE]`, `YHTEENSÄ`, `8.59`, `1.24`, `9.83`, `[LINE]`, `Avoinna`),
        builder.labels({ total: `9.83`, vat14: `9.43`, vat24: `0.40` }),
        builder.question(`Why is "9.83" labeled "total"?`),
        builder.answer(`Because it is on the same line with "YHTEENSÄ" and below "VEROLLINEN". It is also on the line with "Credit/Veloitus" and before "EUR".`),
        builder.question(`Why is "9.43" labeled "vat_14"?`),
        builder.answer(`Because it is on the same line with "14.00%" and below "VEROLLINEN".`),
        builder.question(`Why is "0.40" labeled "vat_24"?`),
        builder.answer(`Because it is on the same line with "24.00%" and below "VEROLLINEN".`),

        builder.divider(),
        // source: 0d4bd4424beb585e39412d360ed32b3d0776f0fa
        builder.context(`K`, `-`, `Citymarket`, `Turku`, `Kupittaa`, `[LINE]`, `Avoinna`, `joka`, `päivä`, `24`, `h`, `[LINE]`, `Uudenmaantie`, `17`, `,`, `20700`, `Turku`, `[LINE]`, `kaupat`, `-`),
        builder.labels({ company: `K - Citymarket Turku Kupittaa`, address: `Uudenmaantie 17 , 20700 Turku` }),

        builder.divider(),
        // source: 1a4e739fc88518b27f8e625dc9d268d3246a7336
        builder.context(`PRISMA`, `HERTTONIEMI`, `[LINE]`, `010`, `7657`, `100`, `(0,0835`, `e`, `/`, `puh+0,`, `1209`, `e/min)`, `[LINE]`, `HOK-Elanto`, `Liiketoiminta`, `Oy,`, `1837957-3`, `[LINE]`, `4`, `K4`, `M000101`, `/`, `4392`, `20:51`, `9-11-2021`, `[LINE]`, `RED`, `CURRY`, `WITH`),
        builder.labels({ company: "PRISMA HERTTONIEMI", date: "9-11-2021" }),

        // the actual user-provided prompt
        builder.divider(),
        builder.context(...lines.reduce((acc, line, idx) => [acc, idx > 0 ? { text: `[LINE]` } : [], line].flatMap(_ => _), [] as Pick<typeof words[number], 'text'>[])),
        `Labels:`,
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
        const vat10Schema = z.object({ vat_10: z.number().or(z.string()).nullable() });
        const vat14Schema = z.object({ vat_14: z.number().or(z.string()).nullable() });
        const vat24Schema = z.object({ vat_24: z.number().or(z.string()).nullable() });
        try {
          const asJSON = JSON.parse(code);
          // ---
          const total = totalSchema.safeParse(asJSON);
          const date = dateSchema.safeParse(asJSON);
          const company = companySchema.safeParse(asJSON);
          const address = addressSchema.safeParse(asJSON);
          const vat10 = vat10Schema.safeParse(asJSON);
          const vat14 = vat14Schema.safeParse(asJSON);
          const vat24 = vat24Schema.safeParse(asJSON);
          // ---
          const TOTAL = total.success ? total.data.total?.toString() ?? null : null;
          const DATE = date.success ? date.data.date ?? null : null;
          const ADDRESS = address.success ? address.data.address ?? null : null;
          const COMPANY = company.success ? company.data.company ?? null : null;
          const TOTAL_TAX_10 = vat10.success ? vat10.data.vat_10?.toString() ?? null : null;
          const TOTAL_TAX_14 = vat14.success ? vat14.data.vat_14?.toString() ?? null : null;
          const TOTAL_TAX_24 = vat24.success ? vat24.data.vat_24?.toString() ?? null : null;
          return { TOTAL, TOTAL_TAX_10, TOTAL_TAX_14, TOTAL_TAX_24, DATE, COMPANY, ADDRESS };
        } catch (error) {
          return {};
        }
      }
      return {};
    },
  };
}
