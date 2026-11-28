import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const localized = z.object({ ja: z.string().min(1), en: z.string().min(1) });

const works = defineCollection({
  loader: glob({ base: "./src/content/works", pattern: "*.json" }),
  schema: ({ image }) =>
    z.object({
      order: z.number().int(),   // collection order isn't guaranteed, so sort by this
      // A live site, or one of Moena's mock sites in public/demos/. A demo is a site-relative path,
      // so on a preview site the card opens that preview's copy, not production's.
      url: z.url().or(z.string().regex(/^\/demos\/[a-z0-9-]+\/$/)),
      image: image(),            // build fails if the file is missing
      title: localized,
      category: localized,
      desc: localized,
      concept: z.boolean().default(false), // a mock site for a fictional business: the card says so
    }),
});

export const collections = { works };
