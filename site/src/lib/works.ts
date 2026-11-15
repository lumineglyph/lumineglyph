import { getCollection } from "astro:content";

// All works, in the order set by each file's `order` field.
// getCollection() doesn't guarantee an order, so always go through this.
export async function getWorks() {
  const works = await getCollection("works");
  return works.sort((a, b) => a.data.order - b.data.order);
}
