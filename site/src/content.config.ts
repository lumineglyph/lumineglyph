import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const localized = z.object({ ja: z.string().min(1), en: z.string().min(1) });

const works = defineCollection({
  loader: glob({ base: "./src/content/works", pattern: "*.json" }),
  schema: ({ image }) =>
    z.object({
      order: z.number().int(),   // collection order isn't guaranteed, so sort by this
      url: z.url(),
      image: image(),            // build fails if the file is missing
      title: localized,
      category: localized,
      desc: localized,
    }),
});

export const collections = { works };
