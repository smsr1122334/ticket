// ─── Start bot + dashboard ─────────────────────────────────────────────────────
process.on("unhandledRejection", (e) => console.error("[UnhandledRejection]", e));
process.on("uncaughtException",  (e) => console.error("[UncaughtException]", e));

require("./dashboard.js"); // ابدأ الويب أول عشان Railway يتعرف على البورت
require("./index.js");     // ثم البوت
