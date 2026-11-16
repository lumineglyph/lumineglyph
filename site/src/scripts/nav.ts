// Home page: highlights the section being read in the side nav and mobile menu,
// and points the JP/EN links at that section so switching language keeps the reader's place.

const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-nav]"));
const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".nav-list a"));
// Each JP/EN link with its built path ("/", "/en/"), so the hash can be swapped without making the href absolute.
const langLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".lang a"), (a) => ({
  a,
  path: a.getAttribute("href") ?? "",
}));
const mobile = window.matchMedia("(max-width:1199px)");

// Height of the fixed mobile header (--header-h in global.css); there's none on desktop.
function headerOffset() {
  return mobile.matches ? 60 : 0;
}

// The last section whose top is above a line 35% down the viewport.
// At the very bottom of the page it's always the last section.
function currentSection(): HTMLElement | undefined {
  const line = headerOffset() + window.innerHeight * 0.35;
  let current = sections[0];
  for (const s of sections) {
    if (s.getBoundingClientRect().top <= line) current = s;
  }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    current = sections[sections.length - 1];
  }
  return current;
}

function update() {
  const id = currentSection()?.id;
  if (!id) return;
  for (const a of navLinks) {
    if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
  // Updated here rather than on click so middle-click and "copy link" get it too.
  for (const { a, path } of langLinks) a.setAttribute("href", `${path}#${id}`);
}

let ticking = false;
window.addEventListener(
  "scroll",
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  },
  { passive: true },
);
window.addEventListener("resize", update);
update();

// Marks this file as a module so its top-level names stay private to it.
export {};
