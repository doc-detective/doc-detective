import fs from "node:fs";
import path from "node:path";

export async function htmlReporter(
  config: any = {},
  outputPath: any,
  results: any,
  options: any = {}
): Promise<string | null> {
  const outputExtensions = [".html", ".htm"];

  outputPath = path.resolve(outputPath);

  let outputFile = "";
  let outputDir = "";
  let reportType = "doc-detective-results";
  if (options.command) {
    if (options.command === "runCoverage") {
      reportType = "coverageResults";
    } else if (options.command === "runTests") {
      reportType = "testResults";
    }
  }

  if (outputExtensions.some((ext) => outputPath.endsWith(ext))) {
    outputDir = path.dirname(outputPath);
    outputFile = outputPath;
    if (fs.existsSync(outputFile)) {
      let counter = 0;
      const ext = path.extname(outputFile);
      const base = outputFile.slice(0, -ext.length);
      while (fs.existsSync(`${base}-${counter}${ext}`)) {
        counter++;
      }
      outputFile = `${base}-${counter}${ext}`;
    }
  } else {
    outputDir = outputPath;
    outputFile = path.resolve(outputDir, `${reportType}-${Date.now()}.html`);
  }

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const html = buildHtml(results);
    fs.writeFileSync(outputFile, html);
    console.log(`See HTML report at ${outputFile}\n`);
    return outputFile;
  } catch (err) {
    console.error(`Error writing HTML report to ${outputFile}. ${err}`);
    return null;
  }
}

function buildHtml(results: any): string {
  const reportJson = JSON.stringify(results, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Doc Detective — Test Report</title>
<style>
${CSS_CONTENT}
</style>
</head>
<body>
<div id="root"></div>
<script id="dd-report-data" type="application/json">${reportJson}</script>
<script>
window.REPORT_DATA = JSON.parse(document.getElementById("dd-report-data").textContent);
</script>
<script>
${JS_CONTENT}
</script>
</body>
</html>`;
}

const CSS_CONTENT = `

:root {
  --dd-green: #4B9A47;
  --dd-green-deep: #22623D;
  --dd-green-bright: #3EB16E;
  --dd-green-electric: #00C122;
  --dd-green-forest: #2E8555;
  --dd-green-tint: #E8F3E7;
  --dd-green-tint-2: #D2E8CE;
  --dd-ink: #0D0E11;
  --dd-ink-2: #1A1C21;
  --dd-ink-3: #2A2D34;
  --dd-gray-900: #3A3F47;
  --dd-gray-700: #5B616B;
  --dd-gray-500: #8A909B;
  --dd-gray-300: #C7CBD3;
  --dd-gray-200: #E2E5EA;
  --dd-gray-100: #F1F3F6;
  --dd-gray-50: #F7F8FA;
  --dd-paper: #FFFFFF;
  --dd-pass: #22623D;
  --dd-pass-bg: #E8F3E7;
  --dd-fail: #B0261A;
  --dd-fail-bg: #FBEAE7;
  --dd-warn: #8A5A00;
  --dd-warn-bg: #FBF1DB;
  --dd-skip: #4A5058;
  --dd-skip-bg: #F1F3F6;
  --dd-info: #2563A0;
  --dd-info-bg: #E5EEF7;
  --dd-code-bg: #0D0E11;
  --dd-code-fg: #E6E8EC;
  --fg1: var(--dd-ink);
  --fg2: #4A5058;
  --fg3: #606770;
  --fg-inverse: var(--dd-paper);
  --fg-brand: var(--dd-green-deep);
  --bg1: var(--dd-paper);
  --bg2: var(--dd-gray-50);
  --bg3: var(--dd-gray-100);
  --bg-brand: var(--dd-green-tint);
  --bg-ink: var(--dd-ink);
  --border-subtle: var(--dd-gray-200);
  --border-strong: var(--dd-gray-300);
  --border-brand: var(--dd-green-bright);
  --shadow-xs: 0 1px 2px rgba(13,14,17,0.04);
  --shadow-sm: 0 1px 2px rgba(13,14,17,0.06), 0 1px 1px rgba(13,14,17,0.04);
  --shadow-md: 0 4px 10px rgba(13,14,17,0.06), 0 2px 4px rgba(13,14,17,0.04);
  --shadow-lg: 0 16px 32px rgba(13,14,17,0.08), 0 4px 8px rgba(13,14,17,0.04);
  --shadow-focus: 0 0 0 3px rgba(62,177,110,0.35);
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --font-display: 'Inter', sans-serif;
  --fs-display: 56px;
  --fs-h1: 40px;
  --fs-h2: 30px;
  --fs-h3: 22px;
  --fs-h4: 18px;
  --fs-body: 16px;
  --fs-small: 14px;
  --fs-micro: 12px;
  --fs-code: 14.5px;
  --lh-tight: 1.15;
  --lh-snug: 1.3;
  --lh-normal: 1.55;
  --lh-loose: 1.7;
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.04em;
  --tracking-caps: 0.08em;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-normal);
  color: var(--fg1);
  background: var(--bg2);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button { font: inherit; }

.app {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

/* Header */
.hdr {
  background: var(--dd-ink);
  color: #F1F3F6;
  border-bottom: 1px solid #000;
  position: relative;
  overflow: hidden;
}
.hdr::after {
  content: "";
  position: absolute; inset: auto 0 0 0;
  height: 3px;
  background: linear-gradient(90deg,
    var(--dd-pass) 0%, var(--dd-pass) var(--pct-pass,0%),
    var(--dd-fail) var(--pct-pass,0%), var(--dd-fail) var(--pct-fail-end,0%),
    var(--dd-warn) var(--pct-fail-end,0%), var(--dd-warn) var(--pct-warn-end,0%),
    var(--dd-skip) var(--pct-warn-end,0%), var(--dd-skip) 100%);
}
.hdr-inner {
  max-width: 1280px; margin: 0 auto;
  padding: 18px 28px 20px;
  display: flex; align-items: center; gap: 18px;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand svg { width: 30px; height: 30px; }
.brand .wm {
  font-weight: 800; font-size: 15px; letter-spacing: -0.01em;
}
.brand .wm .tag { color: var(--dd-green-bright); }
.brand .divider {
  width: 1px; height: 22px; background: #2A2D34; margin: 0 6px;
}
.hdr-title { flex: 1; min-width: 0; }
.hdr-title .eyebrow {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--dd-gray-500); letter-spacing: 0.08em; text-transform: uppercase;
  margin-bottom: 3px;
}
.hdr-title h1 {
  margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hdr-title h1 .sub { color: var(--dd-gray-500); font-weight: 500; }
.hdr-actions { display: flex; gap: 8px; align-items: center; }
.hdr-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px;
  border: 1px solid #2A2D34; background: #15171B; color: #E6E8EC;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background .15s, border-color .15s;
}
.hdr-btn:hover { background: #1F222A; border-color: #3A3F47; }
.hdr-btn.primary { background: var(--dd-green-bright); color: #07150C; border-color: transparent; font-weight: 600; }
.hdr-btn.primary:hover { background: #4DC482; }

/* Meta strip */
.metastrip {
  background: #15171B;
  color: var(--dd-gray-300);
  border-top: 1px solid #000;
  font-family: var(--font-mono); font-size: 12px;
}
.metastrip-inner {
  max-width: 1280px; margin: 0 auto;
  padding: 10px 28px;
  display: flex; flex-wrap: wrap; gap: 24px;
}
.metastrip .m { display: inline-flex; gap: 6px; align-items: baseline; }
.metastrip .m .k { color: var(--dd-gray-500); }
.metastrip .m .v { color: #E6E8EC; }

/* Main */
main {
  max-width: 1280px; margin: 0 auto; width: 100%;
  padding: 32px 28px 96px;
}

/* Verdict */
.verdict {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 20px;
  margin-bottom: 32px;
}
@media (max-width: 900px) {
  .verdict { grid-template-columns: 1fr; }
}

.verdict-card {
  background: var(--dd-paper);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 22px 24px;
  position: relative;
  overflow: hidden;
}
.verdict-card .vk {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg3);
  margin-bottom: 8px;
}
.verdict-card .vv {
  display: flex; align-items: baseline; gap: 12px;
}
.verdict-card .vv .big {
  font-size: 48px; font-weight: 800; letter-spacing: -0.02em; line-height: 1;
  font-family: var(--font-mono);
}
.verdict-card.fail .vv .big { color: var(--dd-fail); }
.verdict-card.warn .vv .big { color: var(--dd-warn); }
.verdict-card.pass .vv .big { color: var(--dd-pass); }
.verdict-card.skip .vv .big { color: var(--dd-skip); }
.verdict-card .vv .note {
  color: var(--fg2); font-size: 14px; line-height: 1.4;
}
.verdict-card .vbar {
  margin-top: 18px; height: 8px; border-radius: 999px; overflow: hidden;
  display: grid;
  background: var(--bg3);
}
.verdict-card .vbar span { display: block; }
.verdict-card .vbar .pass { background: var(--dd-pass); }
.verdict-card .vbar .fail { background: var(--dd-fail); }
.verdict-card .vbar .warn { background: var(--dd-warn); }
.verdict-card .vbar .skip { background: var(--dd-skip); }

/* Summary tiles */
.summary {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 900px) {
  .summary { grid-template-columns: repeat(2, 1fr); }
}
.sum {
  background: var(--dd-paper);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 18px 14px;
  position: relative;
  display: flex; flex-direction: column; justify-content: space-between;
  min-height: 132px;
  overflow: hidden;
}
.sum .lbl {
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg3);
}
.sum .row { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; }
.sum .num { font-size: 30px; font-weight: 800; line-height: 1; font-family: var(--font-mono); letter-spacing: -0.01em; }
.sum .of { font-size: 12px; color: var(--fg3); font-family: var(--font-mono); }
.sum .miniBar {
  margin-top: 14px; height: 6px; border-radius: 999px; overflow: hidden;
  display: grid; background: var(--bg3);
}
.sum .miniBar span { display: block; }
.sum .legend {
  margin-top: 8px; display: flex; gap: 10px; flex-wrap: wrap;
  font-family: var(--font-mono); font-size: 11px; color: var(--fg3);
}
.sum .legend i {
  display: inline-block; width: 8px; height: 8px; border-radius: 2px;
  margin-right: 4px; vertical-align: 1px;
}
.sum.pass .num { color: var(--dd-pass); }
.sum.fail .num { color: var(--dd-fail); }
.sum.warn .num { color: var(--dd-warn); }
.sum.skip .num { color: var(--dd-skip); }
.sum .miniBar .p { background: var(--dd-pass); }
.sum .miniBar .f { background: var(--dd-fail); }
.sum .miniBar .w { background: var(--dd-warn); }
.sum .miniBar .s { background: var(--dd-skip); }
.sum .corner-stripe {
  position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
}
.sum.pass .corner-stripe { background: var(--dd-pass); }
.sum.fail .corner-stripe { background: var(--dd-fail); }
.sum.warn .corner-stripe { background: var(--dd-warn); }
.sum.skip .corner-stripe { background: var(--dd-skip); }

/* Toolbar */
.toolbar {
  display: flex; gap: 8px; align-items: center;
  margin: 28px 0 14px;
  flex-wrap: wrap;
}
.toolbar h2 {
  margin: 0 8px 0 0;
  font-size: 15px; font-weight: 700; letter-spacing: -0.005em;
  color: var(--fg1);
}
.toolbar .count {
  font-family: var(--font-mono); font-size: 12px; color: var(--fg3);
  margin-right: auto;
}
.filter {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--dd-paper);
  font-size: 12px; font-weight: 600; color: var(--fg2);
  font-family: var(--font-mono);
  cursor: pointer; transition: background .12s, border-color .12s, color .12s;
  letter-spacing: 0.04em;
}
.filter:hover { border-color: var(--border-strong); color: var(--fg1); }
.filter .d {
  width: 8px; height: 8px; border-radius: 999px;
}
.filter.pass .d { background: var(--dd-pass); }
.filter.fail .d { background: var(--dd-fail); }
.filter.warn .d { background: var(--dd-warn); }
.filter.skip .d { background: var(--dd-skip); }
.filter.all .d { background: var(--fg2); }
.filter.active.pass { background: var(--dd-pass-bg); color: var(--dd-pass); border-color: color-mix(in oklab, var(--dd-pass) 35%, transparent); }
.filter.active.fail { background: var(--dd-fail-bg); color: var(--dd-fail); border-color: color-mix(in oklab, var(--dd-fail) 35%, transparent); }
.filter.active.warn { background: var(--dd-warn-bg); color: var(--dd-warn); border-color: color-mix(in oklab, var(--dd-warn) 35%, transparent); }
.filter.active.skip { background: var(--dd-skip-bg); color: var(--dd-skip); border-color: var(--border-strong); }
.filter.active.all { background: var(--bg3); color: var(--fg1); border-color: var(--border-strong); }
.toolbar .spacer { width: 1px; height: 22px; background: var(--border-subtle); margin: 0 4px; }
.toolbar .linkbtn {
  border: 0; background: transparent; color: var(--fg-brand);
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 6px 8px;
  border-radius: 6px;
}
.toolbar .linkbtn:hover { background: var(--bg3); }

.search-input {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 12px; border-radius: 8px;
  border: 1px solid var(--border-subtle); background: var(--dd-paper);
  color: var(--fg2); font-size: 13px; min-width: 240px;
}
.search-input svg { color: var(--fg3); flex-shrink: 0; }
.search-input input {
  border: 0; background: transparent; outline: none;
  font: inherit; color: var(--fg1); flex: 1; min-width: 0;
}
.search-input input::placeholder { color: var(--fg3); }

/* Badges */
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px;
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.08em;
  border: 1px solid transparent;
  white-space: nowrap;
}
.badge .dot { width: 6px; height: 6px; border-radius: 999px; }
.badge.pass { background: var(--dd-pass-bg); color: var(--dd-pass); }
.badge.pass .dot { background: var(--dd-pass); }
.badge.fail { background: var(--dd-fail-bg); color: var(--dd-fail); }
.badge.fail .dot { background: var(--dd-fail); }
.badge.warn { background: var(--dd-warn-bg); color: var(--dd-warn); }
.badge.warn .dot { background: var(--dd-warn); }
.badge.skip { background: var(--dd-skip-bg); color: var(--dd-skip); }
.badge.skip .dot { background: var(--dd-skip); }

.tag {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 4px;
  font-family: var(--font-mono); font-size: 11.5px; font-weight: 500;
  background: var(--bg3); color: var(--dd-gray-900);
  border: 1px solid var(--border-subtle);
}

/* Spec card */
.spec {
  background: var(--dd-paper);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
  transition: border-color .12s, box-shadow .12s;
}
.spec:hover { border-color: var(--border-strong); }
.spec.open { box-shadow: var(--shadow-sm); }
.spec .stripe {
  position: absolute; top: 0; left: 0; bottom: 0; width: 4px;
}
.spec.pass .stripe { background: var(--dd-pass); }
.spec.fail .stripe { background: var(--dd-fail); }
.spec.warn .stripe { background: var(--dd-warn); }
.spec.skip .stripe { background: var(--dd-skip); }
.spec-head {
  display: grid;
  grid-template-columns: 20px auto 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 16px 20px 16px 24px;
  cursor: pointer; user-select: none;
}
.spec-head .chev {
  color: var(--fg3); font-size: 12px;
  transition: transform .15s;
}
.spec.open > .spec-head .chev { transform: rotate(90deg); }
.spec-head .title-col { min-width: 0; }
.spec-head .title {
  font-size: 15px; font-weight: 600; color: var(--fg1); letter-spacing: -0.005em;
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
}
.spec-head .desc {
  margin-top: 3px; font-size: 13px; color: var(--fg2); line-height: 1.4;
  max-width: 78ch;
}
.spec-head .path {
  font-family: var(--font-mono); font-size: 12px; color: var(--fg3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.spec-head .metrics {
  display: flex; align-items: center; gap: 14px;
  font-family: var(--font-mono); font-size: 12px; color: var(--fg3);
}
.spec-head .metrics .m { display: inline-flex; align-items: center; gap: 5px; }
.spec-head .metrics .m.pass { color: var(--dd-pass); }
.spec-head .metrics .m.fail { color: var(--dd-fail); }
.spec-head .metrics .m.warn { color: var(--dd-warn); }
.spec-head .metrics .m.skip { color: var(--dd-skip); }
.spec-head .metrics .sep {
  width: 1px; height: 14px; background: var(--border-subtle);
}
.spec-body {
  border-top: 1px solid var(--border-subtle);
  padding: 6px 0 10px 0;
  background: var(--bg2);
}

/* Test row */
.test {
  background: var(--dd-paper);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin: 8px 18px 8px 38px;
  overflow: hidden;
  position: relative;
}
.test::before {
  content: ""; position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
}
.test.pass::before { background: var(--dd-pass); }
.test.fail::before { background: var(--dd-fail); }
.test.warn::before { background: var(--dd-warn); }
.test.skip::before { background: var(--dd-skip); }
.test-head {
  display: grid;
  grid-template-columns: 16px auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 11px 16px 11px 18px;
  cursor: pointer; user-select: none;
}
.test-head .chev { color: var(--fg3); font-size: 11px; transition: transform .15s; }
.test.open > .test-head .chev { transform: rotate(90deg); }
.test-head .title {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
}
.test-head .desc {
  margin-top: 2px; font-size: 12.5px; color: var(--fg2); line-height: 1.4;
}
.test-head .metrics {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-mono); font-size: 11.5px; color: var(--fg3);
}
.test-body {
  border-top: 1px solid var(--border-subtle);
  padding: 0;
}

/* Context block */
.context {
  border-bottom: 1px solid var(--border-subtle);
}
.context:last-child { border-bottom: 0; }
.context-head {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg2);
  font-family: var(--font-mono); font-size: 12px; color: var(--fg2);
}
.context-head .what { color: var(--fg1); font-weight: 600; }
.context-head .meta {
  display: inline-flex; align-items: center; gap: 8px;
  color: var(--fg1); font-weight: 600;
}
.context-head .meta svg { color: var(--fg2); }

/* Steps */
.steps { padding: 0 8px 8px 8px; background: var(--dd-paper); }
.step {
  display: grid;
  grid-template-columns: 16px 88px 120px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 10px 12px;
  border-bottom: 1px dashed var(--border-subtle);
  cursor: pointer;
  user-select: none;
  font-size: 13.5px;
  transition: background .08s;
  position: relative;
}
.step:last-of-type { border-bottom: 0; }
.step:hover { background: var(--bg2); }
.step.pass::before, .step.fail::before, .step.warn::before, .step.skip::before {
  content: ""; position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 2px; border-radius: 2px;
}
.step.pass::before { background: var(--dd-pass); opacity: .55; }
.step.fail::before { background: var(--dd-fail); opacity: .9; }
.step.warn::before { background: var(--dd-warn); opacity: .9; }
.step.skip::before { background: var(--dd-skip); opacity: .55; }
.step .chev { color: var(--fg3); font-size: 10px; transition: transform .15s; }
.step.open .chev { transform: rotate(90deg); }
.step .desc {
  color: var(--fg1); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.step.has-fail .desc, .step.has-warn .desc { font-weight: 500; }
.step .dur {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--fg3);
}

/* Step detail */
.step-detail {
  grid-column: 1 / -1;
  margin: 2px 0 12px 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg2);
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  cursor: default;
}
.step-detail .result-note {
  display: grid; grid-template-columns: auto 1fr; gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--dd-paper);
  border: 1px solid var(--border-subtle);
}
.step-detail .result-note svg { margin-top: 2px; flex-shrink: 0; }
.step-detail.fail .result-note { border-color: color-mix(in oklab, var(--dd-fail) 35%, var(--border-subtle)); background: var(--dd-fail-bg); }
.step-detail.fail .result-note svg { color: var(--dd-fail); }
.step-detail.warn .result-note { border-color: color-mix(in oklab, var(--dd-warn) 35%, var(--border-subtle)); background: var(--dd-warn-bg); }
.step-detail.warn .result-note svg { color: var(--dd-warn); }
.step-detail.pass .result-note { background: var(--dd-paper); }
.step-detail.pass .result-note svg { color: var(--dd-pass); }
.step-detail.skip .result-note svg { color: var(--dd-skip); }
.step-detail .result-note .body { font-size: 13px; line-height: 1.55; color: var(--fg1); word-break: break-word; }
.step-detail .result-note .body code { font-family: var(--font-mono); font-size: 0.92em; background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; }

/* Detail grid */
.detail-grid {
  display: grid; gap: 12px;
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }

.detail-panel {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--dd-paper);
  overflow: hidden;
}
.detail-panel .dp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; font-family: var(--font-mono); font-size: 11px;
  color: var(--fg3); letter-spacing: 0.06em; text-transform: uppercase;
  background: var(--bg2); border-bottom: 1px solid var(--border-subtle);
}
.detail-panel .dp-head .copy-btn {
  border: 0; background: transparent; color: var(--fg3);
  font-size: 11px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  font-family: var(--font-mono); letter-spacing: 0;
}
.detail-panel .dp-head .copy-btn:hover { background: var(--bg3); color: var(--fg1); }
.detail-panel pre {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--font-mono); font-size: 12px; line-height: 1.55;
  color: var(--fg1);
  white-space: pre-wrap; word-break: break-word;
  max-height: 380px; overflow: auto;
}
.detail-panel pre .k { color: #2563A0; }
.detail-panel pre .s { color: #4d7e2c; }
.detail-panel pre .n { color: #9a5a1a; }
.detail-panel pre .b { color: #5B616B; }

/* Key-value list */
.kv {
  font-family: var(--font-mono); font-size: 12px;
  padding: 10px 12px;
  display: grid; grid-template-columns: auto 1fr; gap: 4px 12px;
}
.kv .k { color: var(--fg3); }
.kv .v { color: var(--fg1); word-break: break-word; }

/* Media panel */
.media-panel {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--dd-paper);
  overflow: hidden;
  grid-column: 1 / -1;
}
.media-panel .dp-head { justify-content: space-between; }
.media-panel .mp-body {
  padding: 10px;
  display: flex; flex-wrap: wrap; gap: 10px;
  background: #fafbfc;
}
.media-thumb {
  position: relative;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--dd-ink);
  cursor: zoom-in;
  transition: transform .15s, box-shadow .15s;
}
.media-thumb:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.media-thumb img, .media-thumb video {
  display: block; max-width: 360px; max-height: 240px;
  width: 100%; object-fit: contain; background: #000;
}
.media-thumb .cap {
  padding: 6px 10px;
  font-family: var(--font-mono); font-size: 11px;
  color: var(--fg3); background: var(--bg2);
  border-top: 1px solid var(--border-subtle);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px;
}
.media-thumb .kind {
  position: absolute; top: 6px; left: 6px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  padding: 2px 6px; border-radius: 3px;
  background: rgba(13,14,17,0.78); color: #E6E8EC;
  letter-spacing: 0.05em;
}
.media-thumb .changed-flag {
  position: absolute; top: 6px; right: 6px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  padding: 2px 6px; border-radius: 3px;
  background: var(--dd-green-bright); color: #07150C;
  letter-spacing: 0.05em;
}

/* Lightbox */
.lightbox {
  position: fixed; inset: 0; background: rgba(13,14,17,0.88);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; padding: 40px;
  backdrop-filter: blur(4px);
}
.lightbox img, .lightbox video { max-width: 100%; max-height: 100%; background: #000; }
.lightbox .close {
  position: absolute; top: 18px; right: 18px;
  width: 36px; height: 36px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  background: #15171B; color: #E6E8EC; border: 1px solid #2A2D34;
  cursor: pointer;
}
.lightbox .cap {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
  font-family: var(--font-mono); font-size: 12px; color: #B7BCC5;
  background: #15171B; padding: 6px 12px; border-radius: 6px;
}

/* Empty state */
.empty {
  padding: 40px; text-align: center;
  color: var(--fg3); font-size: 14px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md); background: var(--dd-paper);
}

/* Dark mode */
body.dark {
  --fg1: #F1F3F6;
  --fg2: #D2D6DD;
  --fg3: #B0B6C0;
  --fg-brand: var(--dd-green-bright);
  --bg1: #0D0E11;
  --bg2: #15171B;
  --bg3: #1A1C21;
  --border-subtle: #2A2D34;
  --border-strong: #3A3F47;
  --dd-pass: #4FC285;
  --dd-pass-bg: rgba(62,177,110,0.18);
  --dd-fail: #FF6A5E;
  --dd-fail-bg: rgba(255,106,94,0.15);
  --dd-warn: #F2B53A;
  --dd-warn-bg: rgba(242,181,58,0.15);
  --dd-skip: #B0B6C0;
  --dd-skip-bg: rgba(176,182,192,0.12);
  background: #0D0E11;
  color: #F1F3F6;
}
body.dark .spec, body.dark .test, body.dark .detail-panel,
body.dark .media-panel, body.dark .verdict-card, body.dark .sum {
  background: #15171B; border-color: #2A2D34; color: #E6E8EC;
}
body.dark .spec-body { background: #0D0E11; }
body.dark .test { background-color: rgba(0,0,0,0) !important; }
body.dark .steps { background-color: rgba(0,0,0,0) !important; }
body.dark .test-head .title, body.dark .spec-head .title, body.dark .step .desc { color: #F1F3F6 !important; }
body.dark .step .desc > span:first-child { color: #B0B6C0 !important; }
body.dark .spec-head .desc, body.dark .test-head .desc { color: #D2D6DD; }
body.dark .spec-head .path { color: #B0B6C0; }
body.dark .context-head { background: #0D0E11; border-color: #2A2D34; color: #D2D6DD; }
body.dark .context-head .meta { color: #F1F3F6; }
body.dark .context-head .meta svg { color: #D2D6DD; }
body.dark .step { border-color: rgba(42,45,52,0.6); }
body.dark .step:hover { background: #1A1C21; }
body.dark .step-detail { background: #0D0E11; border-color: #2A2D34; }
body.dark .step-detail .result-note { background: #15171B; border-color: #2A2D34; }
body.dark .step-detail.fail .result-note { background: #2a1414; border-color: #612323; }
body.dark .step-detail.warn .result-note { background: #2a210a; border-color: #5a4510; }
body.dark .detail-panel .dp-head { background: #0D0E11; border-color: #2A2D34; color: #B0B6C0; }
body.dark .detail-panel pre { color: #E6E8EC; }
body.dark .search-input { background: #15171B; border-color: #3A3F47; color: #F1F3F6; }
body.dark .search-input input { color: #F1F3F6; }
body.dark .search-input input::placeholder { color: #B0B6C0; }
body.dark .filter { background: #15171B; border-color: #3A3F47; color: #D2D6DD; }
body.dark main { color: #E6E8EC; }
body.dark .tag { background: #1A1C21; color: #F1F3F6; border-color: #3A3F47; }
body.dark .empty { background: #15171B; border-color: #2A2D34; color: #B0B6C0; }
body.dark .media-panel .mp-body { background: #0D0E11; }
body.dark .media-thumb .cap { background: #15171B; border-color: #2A2D34; color: #B0B6C0; }
body.dark .badge.pass { background: rgba(62,177,110,0.18); color: #6FD69A; }
body.dark .badge.pass .dot { background: #6FD69A; }
body.dark .badge.fail { background: rgba(255,106,94,0.18); color: #FF8A80; }
body.dark .badge.fail .dot { background: #FF8A80; }
body.dark .badge.warn { background: rgba(242,181,58,0.18); color: #F2B53A; }
body.dark .badge.warn .dot { background: #F2B53A; }
body.dark .badge.skip { background: rgba(176,182,192,0.12); color: #D2D6DD; }
body.dark .badge.skip .dot { background: #D2D6DD; }
body.dark .metastrip { color: #D2D6DD; }
body.dark .metastrip .m .k { color: #B0B6C0; }
body.dark .metastrip .m .v { color: #F1F3F6; }
body.dark .hdr-title .eyebrow { color: #B0B6C0; }
body.dark .hdr-title h1 .sub { color: #B0B6C0; }
body.dark .detail-panel pre .k { color: #6FB8FF; }
body.dark .detail-panel pre .s { color: #B8D88A; }
body.dark .detail-panel pre .n { color: #E7A45B; }
body.dark .detail-panel pre .b { color: #8A909B; }

@media print {
  body { background: #fff; }
  .hdr, .toolbar, .metastrip { display: none !important; }
  .spec, .test { break-inside: avoid; box-shadow: none; }
  .spec-body, .test-body, .step-detail { display: block !important; }
}
`;

const JS_CONTENT = `
(function() {
"use strict";

var report = window.REPORT_DATA;
if (!report) { document.getElementById("root").textContent = "No report data found."; return; }

var STATUS_ORDER = ["FAIL", "WARNING", "PASS", "SKIPPED"];
var STATUS_META = {
  PASS:    { slug: "pass", label: "PASS" },
  FAIL:    { slug: "fail", label: "FAIL" },
  WARNING: { slug: "warn", label: "WARNING" },
  SKIPPED: { slug: "skip", label: "SKIPPED" }
};

function statusSlug(s) { return (STATUS_META[s] && STATUS_META[s].slug) || "skip"; }

function fmtDuration(ms) {
  if (ms == null) return "\\u2014";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return (ms / 1000).toFixed(2).replace(/\\.?0+$/, "") + " s";
  var m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000);
  return m + "m " + s + "s";
}

function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function hlJson(json) {
  return esc(json).replace(
    /("(?:[^"\\\\\\\\]|\\\\\\\\.)*")(\\s*:)?|\\b(true|false|null)\\b|-?\\d+\\.?\\d*(?:[eE][+-]?\\d+)?/g,
    function(m, str, colon, bool) {
      if (str) return colon ? '<span class="k">' + str + '</span>' + colon : '<span class="s">' + str + '</span>';
      if (bool) return '<span class="b">' + m + '</span>';
      return '<span class="n">' + m + '</span>';
    }
  );
}

var ACTIONS = ["goTo","find","click","screenshot","checkLink","httpRequest",
  "runShell","runCode","type","typeKeys","wait","record","stopRecord",
  "loadVariables","loadCookie","saveCookie","dragAndDrop","moveTo","scroll"];
function actionKey(step) {
  for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i] in step) return ACTIONS[i];
  return "step";
}

var ICON = {
  chevron: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  print: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 5V1.5h7V5M3.5 10H2a.5.5 0 01-.5-.5v-4A.5.5 0 012 5h10a.5.5 0 01.5.5v4a.5.5 0 01-.5.5h-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="3.5" y="8" width="7" height="4.5" rx=".5" stroke="currentColor" stroke-width="1.2"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v8M3.5 6.5L7 10l3.5-3.5M2 12.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sun: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.75 2.75l1.06 1.06M10.19 10.19l1.06 1.06M11.25 2.75l-1.06 1.06M3.81 10.19l-1.06 1.06" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  moon: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.5 7.5a5.5 5.5 0 01-6-6 5.5 5.5 0 106 6z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  monitor: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M5 12.5h4M7 10v2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L1 12.5h12L7 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 6v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7" cy="10.5" r=".6" fill="currentColor"/></svg>',
  xmark: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  skip: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l4 4-4 4M8 3v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="6.5" height="6.5" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M8 4V2.5A1 1 0 007 1.5H2.5A1 1 0 001.5 2.5V7a1 1 0 001 1H4" stroke="currentColor" stroke-width="1.2"/></svg>',
  chip: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1"/><path d="M5 1v2M7 1v2M5 9v2M7 9v2M1 5h2M1 7h2M9 5h2M9 7h2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>',
  file: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7 1H3.5A1 1 0 002.5 2v8a1 1 0 001 1h5a1 1 0 001-1V3.5L7 1z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 1v2.5h2.5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  finger: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 5.5V4a1 1 0 00-2 0v3L4.5 5.5a1 1 0 00-1.4 1.4L6 10h3l1.5-3.5V5.5A1 1 0 009 4.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  expand: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 8l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  collapse: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 9l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 6l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

var LOGO_SVG = '<svg width="30" height="30" viewBox="0 0 1256 1256" fill="none"><path d="M378.014 0.515785L828.006 0.5C848.561 0.499279 868.275 8.66442 882.809 23.1992L1232.81 373.199C1247.34 387.734 1255.51 407.446 1255.51 428.001L1255.5 1178C1255.5 1220.8 1220.8 1255.5 1178 1255.5H378C335.198 1255.5 300.5 1220.8 300.5 1178V997.53C129.173 961.767 0.5 809.934 0.5 628C0.5 446.064 129.176 294.23 300.505 258.469L300.516 78.0107C300.519 35.2117 335.215 0.517288 378.014 0.515785Z" fill="white"/><path fill-rule="evenodd" clip-rule="evenodd" d="M378.015 40.5158L828.007 40.5C837.953 40.4997 847.492 44.4506 854.525 51.4835L1204.53 401.483C1211.56 408.516 1215.51 418.055 1215.51 428L1215.5 1178C1215.5 1198.71 1198.71 1215.5 1178 1215.5H378C357.289 1215.5 340.5 1198.71 340.5 1178V963.44C171.752 944.786 40.5 801.721 40.5 628C40.5 454.278 171.753 311.213 340.502 292.56L340.516 78.0133C340.518 57.3041 357.306 40.5165 378.015 40.5158ZM415.502 292.56C584.249 311.215 715.5 454.28 715.5 628C715.5 707.673 687.857 780.941 641.694 838.661L804.516 1001.48C819.161 1016.13 819.161 1039.87 804.516 1054.52C789.872 1069.16 766.128 1069.16 751.484 1054.52L588.661 891.694C540.123 930.513 480.59 956.236 415.5 963.438V1140.5H1140.5L1140.51 465.5H828.009C807.298 465.5 790.509 448.711 790.509 428V115.501L415.514 115.514L415.502 292.56ZM865.509 168.533L1087.48 390.5H865.509V168.533ZM378 365.5C233.025 365.5 115.5 483.025 115.5 628C115.5 772.975 233.025 890.5 378 890.5C450.498 890.5 516.071 861.16 563.616 813.616C611.16 766.071 640.5 700.498 640.5 628C640.5 483.025 522.975 365.5 378 365.5Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M165.5 628C165.5 510.639 260.639 415.5 378 415.5C495.361 415.5 590.5 510.639 590.5 628C590.5 686.689 566.748 739.772 528.26 778.26C489.772 816.748 436.689 840.5 378 840.5C260.639 840.5 165.5 745.361 165.5 628ZM283 525.5C262.289 525.5 245.5 542.289 245.5 563C245.5 583.711 262.289 600.5 283 600.5H473C493.711 600.5 510.5 583.711 510.5 563C510.5 542.289 493.711 525.5 473 525.5H283ZM283 655.5C262.289 655.5 245.5 672.289 245.5 693C245.5 713.711 262.289 730.5 383 730.5H383C403.711 730.5 420.5 713.711 420.5 693C420.5 672.289 403.711 655.5 383 655.5H283Z" fill="#4B9A47"/></svg>';

function statusIcon(slug) {
  if (slug === "pass") return ICON.check;
  if (slug === "fail") return ICON.xmark;
  if (slug === "warn") return ICON.warn;
  return ICON.skip;
}

// State
var state = {
  statusFilters: new Set(),
  query: "",
  openSpecs: {},
  openTests: {},
  openSteps: {},
  themeMode: "system",
  lightbox: null
};

// Detect system dark preference
var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function isDark() {
  if (state.themeMode === "dark") return true;
  if (state.themeMode === "light") return false;
  return !!(mql && mql.matches);
}
function applyTheme() {
  document.body.classList.toggle("dark", isDark());
}
if (mql) {
  var onChange = function() { applyTheme(); };
  mql.addEventListener ? mql.addEventListener("change", onChange) : mql.addListener(onChange);
}

// Default expansion: open failures/warnings
function defaultOpen(node) {
  return node.result === "FAIL" || node.result === "WARNING";
}
function isSpecOpen(id, spec) { return id in state.openSpecs ? state.openSpecs[id] : defaultOpen(spec); }
function isTestOpen(id, test) { return id in state.openTests ? state.openTests[id] : defaultOpen(test); }

// Helpers
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function badge(status) {
  var m = STATUS_META[status] || STATUS_META.SKIPPED;
  return '<span class="badge ' + m.slug + '"><span class="dot"></span>' + m.label + '</span>';
}

function tag(text) { return '<span class="tag">' + esc(text) + '</span>'; }

function metric(slug, n, label) {
  if (!n) return "";
  return '<span class="m ' + slug + '"><span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--dd-' + slug + ')"></span>' + n + (label ? " " + label : "") + '</span>';
}

function countTree(spec) {
  var tests = 0, contexts = 0, steps = 0;
  var sc = { pass: 0, fail: 0, warning: 0, skipped: 0 };
  (spec.tests || []).forEach(function(t) {
    tests++;
    (t.contexts || []).forEach(function(c) {
      contexts++;
      (c.steps || []).forEach(function(s) {
        steps++;
        var k = (s.result || "").toLowerCase();
        if (k in sc) sc[k]++;
      });
    });
  });
  return { tests: tests, contexts: contexts, steps: steps, stepCounts: sc };
}

function collectMedia(step) {
  var media = [];
  var outs = step.outputs || {};
  if (step.screenshot && (step.screenshot.path || outs.screenshotPath)) {
    media.push({ kind: "image", path: outs.screenshotPath || step.screenshot.path, changed: outs.changed });
  }
  if (outs.screenshotPath && !media.find(function(m) { return m.path === outs.screenshotPath; })) {
    media.push({ kind: "image", path: outs.screenshotPath, changed: outs.changed });
  }
  if (step.record && (step.record.path || outs.recordingPath)) {
    media.push({ kind: "video", path: outs.recordingPath || step.record.path });
  }
  if (step.stopRecord && outs.recordingPath) {
    media.push({ kind: "video", path: outs.recordingPath });
  }
  return media;
}

// Build header
function buildHeader() {
  var s = report.summary.specs;
  var tot = s.pass + s.fail + s.warning + s.skipped;
  var pctPass = tot ? (s.pass / tot * 100) + "%" : "0%";
  var pctFailEnd = tot ? ((s.pass + s.fail) / tot * 100) + "%" : "0%";
  var pctWarnEnd = tot ? ((s.pass + s.fail + s.warning) / tot * 100) + "%" : "0%";

  var meta = report.meta || {};
  var started = meta.startedAt ? new Date(meta.startedAt) : null;
  var reportIdShort = (report.reportId || "").slice(0, 8);

  var hdr = el("header", "hdr");
  hdr.style.setProperty("--pct-pass", pctPass);
  hdr.style.setProperty("--pct-fail-end", pctFailEnd);
  hdr.style.setProperty("--pct-warn-end", pctWarnEnd);

  var inner = el("div", "hdr-inner");

  // Brand
  inner.innerHTML = '<div class="brand">' + LOGO_SVG +
    '<div class="wm">Doc Detective <span class="tag">/ report</span></div>' +
    '<div class="divider"></div></div>';

  // Title
  var title = el("div", "hdr-title");
  title.innerHTML = '<div class="eyebrow">Report' + (reportIdShort ? " \\u00B7 " + esc(reportIdShort) : "") + '</div>' +
    '<h1>Test run<span class="sub"> \\u00B7 ' + (started ? started.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "\\u2014") + '</span></h1>';
  inner.appendChild(title);

  // Actions
  var actions = el("div", "hdr-actions");

  var themeBtn = el("button", "hdr-btn");
  function updateThemeBtn() {
    var m = state.themeMode;
    themeBtn.innerHTML = (m === "dark" ? ICON.moon : m === "light" ? ICON.sun : ICON.monitor) +
      '<span style="text-transform:capitalize">' + m + '</span>';
    themeBtn.title = "Theme: " + m;
  }
  updateThemeBtn();
  themeBtn.onclick = function() {
    var order = ["system", "light", "dark"];
    state.themeMode = order[(order.indexOf(state.themeMode) + 1) % 3];
    updateThemeBtn();
    applyTheme();
  };
  actions.appendChild(themeBtn);

  var printBtn = el("button", "hdr-btn", ICON.print + " Print");
  printBtn.onclick = function() { window.print(); };
  actions.appendChild(printBtn);

  var jsonBtn = el("button", "hdr-btn primary", ICON.download + " JSON");
  jsonBtn.onclick = function() {
    var blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "testResults-" + (report.reportId || "report").slice(0, 8) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  actions.appendChild(jsonBtn);

  inner.appendChild(actions);
  hdr.appendChild(inner);

  // Meta strip
  var ms = el("div", "metastrip");
  var msInner = el("div", "metastrip-inner");
  var fields = [
    ["tool", (meta.tool || "doc-detective") + "@" + (meta.version || "\\u2014")],
    ["runtime", (meta.platform || "\\u2014") + " \\u00B7 node " + (meta.node || "\\u2014")],
    ["branch", (meta.branch || "\\u2014") + "@" + (meta.commit || "").slice(0, 7) || "\\u2014"],
    ["actor", meta.actor || "\\u2014"],
    ["duration", fmtDuration(meta.startedAt && meta.finishedAt ? new Date(meta.finishedAt) - new Date(meta.startedAt) : null)],
    ["cwd", meta.cwd || "\\u2014"]
  ];
  fields.forEach(function(f) {
    msInner.innerHTML += '<span class="m"><span class="k">' + f[0] + '</span> <span class="v">' + esc(f[1]) + '</span></span>';
  });
  ms.appendChild(msInner);
  hdr.appendChild(ms);

  return hdr;
}

// Verdict banner
function buildVerdict() {
  var s = report.summary.specs;
  var total = s.pass + s.fail + s.warning + s.skipped;
  var slug = s.fail ? "fail" : s.warning ? "warn" : s.pass ? "pass" : "skip";
  var headline = s.fail
    ? s.fail + " spec" + (s.fail > 1 ? "s" : "") + " failing"
    : s.warning
    ? s.warning + " warning" + (s.warning > 1 ? "s" : "")
    : s.pass
    ? "All " + s.pass + " spec" + (s.pass > 1 ? "s" : "") + " passed"
    : "No specs ran";
  var parts = headline.split(" ");
  var pct = function(n) { return total ? n / total * 100 : 0; };

  var card = el("div", "verdict-card " + slug);
  card.innerHTML = '<div class="vk">Overall verdict</div>' +
    '<div class="vv"><div class="big">' + esc(parts[0]) + '</div><div class="note">' + esc(parts.slice(1).join(" ")) + '</div></div>' +
    '<div class="vbar" style="grid-template-columns:' + pct(s.pass) + '% ' + pct(s.fail) + '% ' + pct(s.warning) + '% ' + pct(s.skipped) + '%">' +
    '<span class="pass"></span><span class="fail"></span><span class="warn"></span><span class="skip"></span></div>';
  return card;
}

function buildSumTile(label, counts, levelLabel) {
  var total = counts.pass + counts.fail + counts.warning + counts.skipped;
  var kind = counts.fail ? "fail" : counts.warning ? "warn" : counts.pass ? "pass" : "skip";
  var primaryN = kind === "pass" ? counts.pass : kind === "fail" ? counts.fail : kind === "warn" ? counts.warning : counts.skipped;
  var cols = total
    ? (counts.pass / total * 100) + "% " + (counts.fail / total * 100) + "% " + (counts.warning / total * 100) + "% " + (counts.skipped / total * 100) + "%"
    : "1fr";

  var tile = el("div", "sum " + kind);
  tile.innerHTML = '<div class="corner-stripe"></div><div><div class="lbl">' + esc(label) + '</div>' +
    '<div class="row"><div class="num">' + primaryN + '</div><div class="of">of ' + total + " " + esc(levelLabel) + '</div></div></div>' +
    '<div><div class="miniBar" style="grid-template-columns:' + cols + '">' +
    (counts.pass ? '<span class="p"></span>' : '') +
    (counts.fail ? '<span class="f"></span>' : '') +
    (counts.warning ? '<span class="w"></span>' : '') +
    (counts.skipped ? '<span class="s"></span>' : '') + '</div>' +
    '<div class="legend">' +
    '<span><i style="background:var(--dd-pass)"></i>' + counts.pass + ' pass</span>' +
    '<span><i style="background:var(--dd-fail)"></i>' + counts.fail + ' fail</span>' +
    '<span><i style="background:var(--dd-warn)"></i>' + counts.warning + ' warn</span>' +
    '<span><i style="background:var(--dd-skip)"></i>' + counts.skipped + ' skip</span></div></div>';
  return tile;
}

// Step detail
function buildStepDetail(step) {
  var slug = statusSlug(step.result);
  var ak = actionKey(step);
  var media = collectMedia(step);
  var detail = el("div", "step-detail " + slug);
  detail.onclick = function(e) { e.stopPropagation(); };

  if (step.resultDescription) {
    detail.innerHTML += '<div class="result-note">' + statusIcon(slug) +
      '<div class="body">' + esc(step.resultDescription) + '</div></div>';
  }

  if (media.length) {
    var mp = '<div class="media-panel"><div class="dp-head"><span>MEDIA \\u00B7 ' + media.length + ' item' + (media.length > 1 ? 's' : '') + '</span></div><div class="mp-body">';
    media.forEach(function(m) {
      mp += '<div class="media-thumb" data-media-path="' + escAttr(m.path || '') + '" data-media-kind="' + escAttr(m.kind) + '">' +
        '<span class="kind">' + (m.kind === "video" ? "MP4" : "PNG") + '</span>' +
        (m.changed ? '<span class="changed-flag">UPDATED</span>' : '') +
        (m.kind === "video"
          ? '<video src="' + escAttr(m.path || '') + '" muted playsinline preload="metadata"></video>'
          : '<img src="' + escAttr(m.path || '') + '" alt="' + escAttr(m.path || '') + '" onerror="this.style.display=\\'none\\'"/>') +
        '<div class="cap">' + esc(m.path || '') + '</div></div>';
    });
    mp += '</div></div>';
    detail.innerHTML += mp;
  }

  // Input/output panels
  var rest = Object.assign({}, step);
  delete rest.result; delete rest.resultDescription; delete rest.stepId; delete rest.outputs; delete rest.description; delete rest.duration;
  var inputJson = JSON.stringify(rest, null, 2);
  var outputJson = step.outputs && Object.keys(step.outputs).length ? JSON.stringify(step.outputs, null, 2) : null;

  var grid = el("div", "detail-grid");
  grid.innerHTML = '<div class="detail-panel"><div class="dp-head"><span>INPUT \\u00B7 ' + esc(ak) + '</span><button class="copy-btn" data-copy="' + escAttr(inputJson) + '">' + ICON.copy + ' Copy</button></div><pre>' + hlJson(inputJson) + '</pre></div>';
  if (outputJson) {
    grid.innerHTML += '<div class="detail-panel"><div class="dp-head"><span>OUTPUTS</span><button class="copy-btn" data-copy="' + escAttr(outputJson) + '">' + ICON.copy + ' Copy</button></div><pre>' + hlJson(outputJson) + '</pre></div>';
  }
  detail.appendChild(grid);

  return detail;
}

// Build step row
function buildStep(step, idx) {
  var slug = statusSlug(step.result);
  var ak = actionKey(step);
  var primary = step.description
    || (step.goTo && "Go to " + step.goTo)
    || (step.httpRequest && (step.httpRequest.method || "GET") + " " + (step.httpRequest.url || ""))
    || (step.runShell && (step.runShell.command || "") + " " + (step.runShell.args || []).join(" "))
    || step.resultDescription || "(step)";

  var isOpen = !!state.openSteps[step.stepId];
  var row = el("div", "step " + slug + (isOpen ? " open" : ""));
  row.innerHTML = '<span class="chev">' + ICON.chevron + '</span>' +
    badge(step.result) + tag(ak) +
    '<span class="desc" title="' + escAttr(primary) + '"><span style="color:var(--fg3);font-family:var(--font-mono);font-size:11px;margin-right:8px">' + String(idx + 1).padStart(2, "0") + '</span>' + esc(primary) + '</span>' +
    '<span class="dur">' + fmtDuration(step.duration) + '</span>';

  if (isOpen) {
    row.appendChild(buildStepDetail(step));
  }

  row.onclick = function(e) {
    if (e.target.closest && e.target.closest(".step-detail")) return;
    state.openSteps[step.stepId] = !state.openSteps[step.stepId];
    render();
  };

  return row;
}

// Context block
function buildContext(ctx) {
  var browser = ctx.browser && ctx.browser.name;
  var headless = ctx.browser && ctx.browser.headless;
  var vw = ctx.browser && ctx.browser.viewport;
  var contextLabel = browser ? browser + " / " + ctx.platform : ctx.platform || "shell";
  if (headless) contextLabel += " \\u00B7 headless";
  if (vw) contextLabel += " \\u00B7 " + vw.width + "\\u00D7" + vw.height;

  var block = el("div", "context");
  var head = el("div", "context-head");
  head.innerHTML = ICON.chip +
    '<span class="what">' + esc(contextLabel) + '</span>' +
    '<span class="meta">' + ICON.finger + ' ' + esc((ctx.contextId || "").slice(0, 8)) + '</span>' +
    badge(ctx.result);
  block.appendChild(head);

  var visibleSteps = (ctx.steps || []).filter(function(s) {
    if (state.statusFilters.size && !state.statusFilters.has(s.result)) return false;
    if (state.query) return JSON.stringify(s).toLowerCase().indexOf(state.query.toLowerCase()) !== -1;
    return true;
  });

  if (visibleSteps.length === 0) {
    block.innerHTML += '<div class="empty" style="margin:8px 16px 10px;padding:16px">No steps match the current filter.</div>';
  } else {
    var stepsDiv = el("div", "steps");
    visibleSteps.forEach(function(s, i) { stepsDiv.appendChild(buildStep(s, i)); });
    block.appendChild(stepsDiv);
  }

  return block;
}

// Test card
function buildTest(test) {
  var slug = statusSlug(test.result);
  var isOpen = isTestOpen(test.testId, test);
  var card = el("div", "test " + slug + (isOpen ? " open" : ""));

  var stepAgg = { pass: 0, fail: 0, warning: 0, skipped: 0 };
  (test.contexts || []).forEach(function(c) {
    (c.steps || []).forEach(function(s) {
      var k = (s.result || "").toLowerCase();
      if (k in stepAgg) stepAgg[k]++;
    });
  });

  var nCtx = (test.contexts || []).length;
  var head = el("div", "test-head");
  head.innerHTML = '<span class="chev">' + ICON.chevron + '</span>' +
    badge(test.result) +
    '<div class="title-col"><div class="title">' + esc(test.description || test.testId) +
    ' ' + tag(nCtx + " context" + (nCtx !== 1 ? "s" : "")) + '</div>' +
    (test.contentPath ? '<div class="desc" style="font-family:var(--font-mono);font-size:12px;color:var(--fg3)">' + ICON.file + ' ' + esc(test.contentPath) + '</div>' : '') +
    '</div>' +
    '<div class="metrics">' +
    metric("pass", stepAgg.pass, "pass") + metric("fail", stepAgg.fail, "fail") +
    metric("warn", stepAgg.warning, "warn") + metric("skip", stepAgg.skipped, "skip") + '</div>';

  head.onclick = function() {
    state.openTests[test.testId] = !isOpen;
    render();
  };
  card.appendChild(head);

  if (isOpen) {
    var body = el("div", "test-body");
    (test.contexts || []).forEach(function(c) { body.appendChild(buildContext(c)); });
    card.appendChild(body);
  }

  return card;
}

// Spec card
function buildSpec(spec) {
  var slug = statusSlug(spec.result);
  var isOpen = isSpecOpen(spec.specId, spec);
  var counts = countTree(spec);
  var card = el("div", "spec " + slug + (isOpen ? " open" : ""));

  card.innerHTML = '<div class="stripe"></div>';

  var head = el("div", "spec-head");
  head.innerHTML = '<span class="chev">' + ICON.chevron + '</span>' +
    badge(spec.result) +
    '<div class="title-col"><div class="title">' + esc(spec.description || spec.specId) +
    (spec.specPath ? ' <span class="path" title="' + escAttr(spec.specPath) + '">' + ICON.file + ' ' + esc(spec.specPath) + '</span>' : '') +
    '</div>' +
    (spec.contentPath && spec.contentPath !== spec.specPath
      ? '<div class="desc">Source: <code style="font-family:var(--font-mono);font-size:12px">' + esc(spec.contentPath) + '</code></div>'
      : '') +
    '</div>' +
    '<div class="metrics"><span class="m">' + counts.tests + ' test' + (counts.tests !== 1 ? 's' : '') + '</span><span class="sep"></span>' +
    metric("pass", counts.stepCounts.pass, "") + metric("fail", counts.stepCounts.fail, "") +
    metric("warn", counts.stepCounts.warning, "") + metric("skip", counts.stepCounts.skipped, "") + '</div>';

  head.onclick = function() {
    state.openSpecs[spec.specId] = !isOpen;
    render();
  };
  card.appendChild(head);

  if (isOpen) {
    var body = el("div", "spec-body");
    (spec.tests || []).forEach(function(t) { body.appendChild(buildTest(t)); });
    card.appendChild(body);
  }

  return card;
}

// Filter specs
function getVisibleSpecs() {
  return (report.specs || []).filter(function(sp) {
    if (state.statusFilters.size && !state.statusFilters.has(sp.result)) {
      var hasMatching = (sp.tests || []).some(function(t) {
        return (t.contexts || []).some(function(c) {
          return (c.steps || []).some(function(s) { return state.statusFilters.has(s.result); });
        });
      });
      if (!hasMatching) return false;
    }
    if (state.query) {
      if (JSON.stringify(sp).toLowerCase().indexOf(state.query.toLowerCase()) === -1) return false;
    }
    return true;
  });
}

// Render
function render() {
  applyTheme();
  var root = document.getElementById("root");
  root.innerHTML = "";
  var app = el("div", "app");

  app.appendChild(buildHeader());

  var main = el("main");

  // Verdict + summary
  var verdict = el("section", "verdict");
  verdict.appendChild(buildVerdict());
  var summary = el("div", "summary");
  summary.appendChild(buildSumTile("Specs", report.summary.specs, "specs"));
  summary.appendChild(buildSumTile("Tests", report.summary.tests, "tests"));
  summary.appendChild(buildSumTile("Contexts", report.summary.contexts, "contexts"));
  summary.appendChild(buildSumTile("Steps", report.summary.steps, "steps"));
  verdict.appendChild(summary);
  main.appendChild(verdict);

  // Toolbar
  var visibleSpecs = getVisibleSpecs();
  var toolbar = el("div", "toolbar");
  toolbar.innerHTML = '<h2>Specifications</h2><span class="count">' + visibleSpecs.length + ' of ' + report.specs.length + ' shown</span>';

  STATUS_ORDER.forEach(function(s) {
    var m = STATUS_META[s];
    var active = state.statusFilters.has(s);
    var n = report.summary.specs[m.slug === "warn" ? "warning" : m.slug === "skip" ? "skipped" : m.slug];
    var btn = el("button", "filter " + m.slug + (active ? " active" : ""), '<span class="d"></span>' + m.label + ' \\u00B7 ' + n);
    btn.onclick = function() {
      if (state.statusFilters.has(s)) state.statusFilters.delete(s); else state.statusFilters.add(s);
      render();
    };
    toolbar.appendChild(btn);
  });

  if (state.statusFilters.size > 0 || state.query) {
    var clearBtn = el("button", "linkbtn", "Clear filters");
    clearBtn.onclick = function() { state.statusFilters.clear(); state.query = ""; render(); };
    toolbar.appendChild(clearBtn);
  }

  toolbar.appendChild(el("span", "spacer"));

  var searchDiv = el("div", "search-input");
  searchDiv.innerHTML = ICON.search;
  var searchInput = document.createElement("input");
  searchInput.placeholder = "Search specs, tests, steps, paths\\u2026";
  searchInput.value = state.query;
  searchInput.oninput = function() { state.query = searchInput.value; render(); };
  searchDiv.appendChild(searchInput);
  toolbar.appendChild(searchDiv);

  toolbar.appendChild(el("span", "spacer"));
  var expandBtn = el("button", "linkbtn", ICON.expand + ' Expand all');
  expandBtn.onclick = function() {
    (report.specs || []).forEach(function(sp) {
      state.openSpecs[sp.specId] = true;
      (sp.tests || []).forEach(function(t) {
        state.openTests[t.testId] = true;
        (t.contexts || []).forEach(function(c) {
          (c.steps || []).forEach(function(s) { state.openSteps[s.stepId] = true; });
        });
      });
    });
    render();
  };
  toolbar.appendChild(expandBtn);

  var collapseBtn = el("button", "linkbtn", ICON.collapse + ' Collapse');
  collapseBtn.onclick = function() {
    (report.specs || []).forEach(function(sp) {
      state.openSpecs[sp.specId] = false;
      (sp.tests || []).forEach(function(t) {
        state.openTests[t.testId] = false;
        (t.contexts || []).forEach(function(c) {
          (c.steps || []).forEach(function(s) { state.openSteps[s.stepId] = false; });
        });
      });
    });
    render();
  };
  toolbar.appendChild(collapseBtn);

  main.appendChild(toolbar);

  // Spec list
  if (visibleSpecs.length === 0) {
    var empty = el("div", "empty");
    empty.innerHTML = '<div style="font-size:18px;color:var(--fg2);margin-bottom:6px">Nothing matches the current filter.</div>';
    var clrBtn = el("button", "linkbtn", "Clear filters");
    clrBtn.onclick = function() { state.statusFilters.clear(); state.query = ""; render(); };
    empty.appendChild(clrBtn);
    main.appendChild(empty);
  } else {
    visibleSpecs.forEach(function(sp) { main.appendChild(buildSpec(sp)); });
  }

  app.appendChild(main);
  root.appendChild(app);

  // Lightbox
  if (state.lightbox) {
    var lb = el("div", "lightbox");
    var m = state.lightbox;
    lb.innerHTML = '<button class="close">' + ICON.close + '</button>' +
      (m.kind === "video"
        ? '<video src="' + esc(m.path) + '" controls autoplay></video>'
        : '<img src="' + escAttr(m.path) + '" alt="' + escAttr(m.path) + '"/>') +
      '<div class="cap">' + esc(m.path) + '</div>';
    lb.onclick = function() { state.lightbox = null; render(); };
    root.appendChild(lb);
  }

  // Attach copy button handlers
  root.querySelectorAll(".copy-btn[data-copy]").forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var text = btn.getAttribute("data-copy");
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          btn.innerHTML = ICON.check + " Copied";
          setTimeout(function() { btn.innerHTML = ICON.copy + " Copy"; }, 1200);
        });
      }
    };
  });

  // Attach media click handlers
  root.querySelectorAll(".media-thumb").forEach(function(thumb) {
    thumb.onclick = function(e) {
      e.stopPropagation();
      state.lightbox = { path: thumb.getAttribute("data-media-path"), kind: thumb.getAttribute("data-media-kind") };
      render();
    };
  });

  // Focus search if it had focus
  if (document.activeElement === document.body && state.query) {
    var si = root.querySelector(".search-input input");
    if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
  }
}

// Escape key closes lightbox
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape" && state.lightbox) { state.lightbox = null; render(); }
});

// Initial render
render();
})();
`;
