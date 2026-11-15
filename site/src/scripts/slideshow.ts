// Left-column slideshow. The slides are rendered at build time; this shows them
// in a random order, cross-fading to the next one every 6 seconds.

const INTERVAL_MS = 6000;

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const slides = Array.from(document.querySelectorAll<HTMLElement>("#slides .slide"));

if (slides.length > 0) {
  let order = shuffle(slides.map((_, i) => i));
  let pos = 0;

  // The build marks the first slide active so something shows without JavaScript.
  // Jump straight to the random first slide, without the cross-fade.
  for (const s of slides) s.style.transition = "none";
  slides.forEach((s, i) => s.classList.toggle("is-active", i === order[0]));
  void slides[0].offsetWidth; // force a reflow so the jump isn't animated
  for (const s of slides) s.style.transition = "";

  if (slides.length > 1) {
    setInterval(() => {
      if (document.hidden) return; // don't advance in a background tab
      const prev = order[pos];
      pos++;
      if (pos >= order.length) {
        order = shuffle(order.slice());
        // Don't show the same slide twice in a row across a reshuffle.
        if (order[0] === prev) order.push(order.shift()!);
        pos = 0;
      }
      slides[prev].classList.remove("is-active");
      slides[order[pos]].classList.add("is-active");
    }, INTERVAL_MS);
  }
}
