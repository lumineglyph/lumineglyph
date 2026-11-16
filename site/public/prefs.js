// Applies saved display preferences before the first paint, so there's no flash of the wrong theme
// and paused animations don't start moving first. It must stay a small blocking classic script in <head>.
// src/scripts/theme-switch.ts and src/scripts/motion.ts handle the buttons.
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    if (localStorage.getItem("motion") === "paused") document.documentElement.setAttribute("data-motion", "paused");
  } catch (e) {
    // Storage can be blocked (private mode, site settings); fall back to the defaults.
  }
})();
