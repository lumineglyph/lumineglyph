// Applies the saved theme choice before the first paint, so there's no flash of the wrong theme.
// It must stay a small blocking classic script in <head>. src/scripts/theme-switch.ts does the rest.
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    // Storage can be blocked (private mode, site settings); fall back to the OS theme.
  }
})();
