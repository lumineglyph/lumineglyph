import ja from "./ja.json";
import en from "./en.json";

// Type-level check: `astro check` fails if either file lacks a key the other has.
en satisfies typeof ja;
ja satisfies typeof en;

export const copy = { ja, en };
export type Lang = keyof typeof copy;
