// Wires up the System / Light / Dark switch (ThemeSwitch.astro).
// public/theme.js has already applied the saved choice before the first paint;
// this keeps the buttons in sync, saves new choices and reveals the switch.

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const root = document.documentElement;
const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-theme-switch]"));
const buttons = groups.flatMap((g) => Array.from(g.querySelectorAll<HTMLButtonElement>("button[data-theme-value]")));

function savedChoice(): Choice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Storage blocked: treat as System.
  }
  return "system";
}

function save(choice: Choice) {
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies to this page view.
  }
}

function apply(choice: Choice) {
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.themeValue === choice));
}

for (const b of buttons) {
  b.addEventListener("click", () => {
    const choice = b.dataset.themeValue as Choice;
    apply(choice);
    save(choice);
  });
}

// Keep other open tabs in step when the choice changes in one of them.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY || e.key === null) apply(savedChoice());
});

apply(savedChoice());
for (const g of groups) g.hidden = false;
