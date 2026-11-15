// The mobile slide-out menu (1199px and below).

const toggle = document.querySelector<HTMLButtonElement>(".m-toggle");
const menu = document.getElementById("m-menu");

if (toggle && menu) {
  const isOpen = () => toggle.getAttribute("aria-expanded") === "true";

  const setMenu = (open: boolean) => {
    toggle.setAttribute("aria-expanded", String(open));
    // The translated labels are rendered at build time as data attributes.
    toggle.setAttribute("aria-label", (open ? toggle.dataset.labelClose : toggle.dataset.labelOpen) ?? "");
    menu.classList.toggle("open", open);
    // Stop the page behind the menu from scrolling.
    document.body.style.overflow = open ? "hidden" : "";
  };

  toggle.addEventListener("click", () => setMenu(!isOpen()));

  // Following a link in the menu closes it.
  for (const a of menu.querySelectorAll("a")) a.addEventListener("click", () => setMenu(false));

  // Escape closes it and puts focus back on the toggle.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setMenu(false);
      toggle.focus();
    }
  });

  // Growing past the breakpoint hides the mobile header, so close the menu too.
  window.matchMedia("(max-width:1199px)").addEventListener("change", (e) => {
    if (!e.matches) setMenu(false);
  });
}
