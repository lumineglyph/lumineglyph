// The pause/play button for the orbit animation and the slideshow (WCAG 2.2.2 Pause, Stop, Hide).
// The paused state is data-motion="paused" on <html>: the CSS pauses the orbit and slideshow.ts checks it.
// public/prefs.js applies a saved choice before the first paint.

const STORAGE_KEY = "motion";
const root = document.documentElement;
const button = document.querySelector<HTMLButtonElement>("[data-motion-toggle]");

function setPaused(paused: boolean) {
  if (paused) root.dataset.motion = "paused";
  else delete root.dataset.motion;
  button?.setAttribute("aria-pressed", String(paused));
}

if (button) {
  setPaused(root.dataset.motion === "paused");
  button.addEventListener("click", () => {
    const paused = root.dataset.motion !== "paused";
    setPaused(paused);
    try {
      if (paused) localStorage.setItem(STORAGE_KEY, "paused");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the choice still applies to this page view.
    }
  });
  button.hidden = false;
}

// Marks this file as a module so its top-level names stay private to it.
export {};
