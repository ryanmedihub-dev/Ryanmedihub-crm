// Server-safe: runs in <head> before first paint so a saved dark theme never flashes light.
// Keep in step with lib/theme.js (key "crm-theme", untouched path "/").
export const THEME_BOOT = `(function(){try{var p=location.pathname;if(p==="/")return;var t=JSON.parse(localStorage.getItem("crm-theme")||"{}");var d=t.mode==="dark"||(t.mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;if(d)e.setAttribute("data-mode","dark");if(t.accent&&t.accent!=="emerald")e.setAttribute("data-accent",t.accent);}catch(_){}})();`;
