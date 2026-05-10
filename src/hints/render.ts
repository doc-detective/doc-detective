// Tiny markdown → ANSI renderer for hint bodies.
//
// Supported subset:
//   **bold**            → bold
//   _italic_            → italic (falls back to the SGR italic code; not all
//                         terminals render it, but it's harmless and matches
//                         the bold/cyan style of the rest of the codebase)
//   `inline code`       → cyan
//   ```fenced```        → cyan block, every line prefixed with two spaces
//   [text](url)         → OSC 8 hyperlink when the env looks supportive,
//                         otherwise `text (url)` with the URL in cyan
//   - / * list items    → "  • item"
//
// No new dependencies. The `colors` palette is a deliberate superset
// of the small palette used by `terminalReporter` in `src/utils.ts`
// (red/green/yellow/cyan/reset/bold) — `italic` and `dim` are added
// here because hint markdown needs them. Both palettes are
// intentionally tiny; they don't share a definition.

export const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  dim: "\x1b[2m",
};

export interface RenderOptions {
  /**
   * If true, render `[text](url)` as an OSC 8 hyperlink. If false, render
   * as `text (url)` with the URL in cyan. Defaults to `supportsOsc8(env)`.
   */
  osc8?: boolean;
}

/**
 * Heuristic check for OSC 8 hyperlink support. Errs on the side of falling
 * back — terminals that don't render OSC 8 typically print the raw escape
 * sequence as visible junk, which is worse than a plain `text (url)`.
 */
export function supportsOsc8(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR) return false;
  if (env.TERM === "dumb") return false;
  // Known-good terminals.
  if (env.TERM_PROGRAM === "iTerm.app") return true;
  if (env.TERM_PROGRAM === "vscode") return true;
  if (env.TERM_PROGRAM === "WezTerm") return true;
  if (env.WT_SESSION) return true; // Windows Terminal
  if (env.KITTY_WINDOW_ID) return true;
  if (env.DOMTERM) return true;
  return false;
}

/**
 * Render a markdown string to an ANSI-colored string. Pure — no I/O. Errors
 * are not thrown; malformed input degrades to as-much-as-we-can text.
 */
export function renderMarkdown(md: string, options: RenderOptions = {}): string {
  const useOsc8 =
    typeof options.osc8 === "boolean" ? options.osc8 : supportsOsc8();

  // Split on lines first so fenced code blocks can be detected without a
  // multiline-dotall regex (which would also need careful escape handling).
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;

  for (const rawLine of lines) {
    const fenceMatch = /^\s*```/.test(rawLine);
    if (fenceMatch) {
      inFence = !inFence;
      // The fence delimiter line itself is not emitted; we just open/close.
      continue;
    }

    if (inFence) {
      // Code block content: indent two spaces, color cyan. Reset at line end
      // so the indentation doesn't bleed if the terminal wraps.
      out.push(`  ${colors.cyan}${rawLine}${colors.reset}`);
      continue;
    }

    out.push(renderInline(rawLine, useOsc8));
  }

  return out.join("\n");
}

function renderInline(line: string, useOsc8: boolean): string {
  // List item: "- foo" or "* foo" (with optional leading whitespace).
  const listMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (listMatch) {
    const [, indent, body] = listMatch;
    return `${indent}  • ${applyInlineFormatting(body, useOsc8)}`;
  }
  return applyInlineFormatting(line, useOsc8);
}

function applyInlineFormatting(s: string, useOsc8: boolean): string {
  let out = s;

  // Inline code FIRST so we don't accidentally process markdown inside
  // backticks. Use a placeholder so subsequent passes leave it alone.
  const codeSlots: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeSlots.length;
    codeSlots.push(`${colors.cyan}${code}${colors.reset}`);
    return `\x00CODE${idx}\x00`;
  });

  // Links: [text](url)
  const linkSlots: string[] = [];
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const idx = linkSlots.length;
    if (useOsc8) {
      // OSC 8 hyperlink: ESC ] 8 ;; URL BEL TEXT ESC ] 8 ;; BEL
      linkSlots.push(`\x1b]8;;${url}\x07${text}\x1b]8;;\x07`);
    } else {
      linkSlots.push(`${text} (${colors.cyan}${url}${colors.reset})`);
    }
    return `\x00LINK${idx}\x00`;
  });

  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, `${colors.bold}$1${colors.reset}`);

  // Italic: _text_  (single underscore pair, not inside a word)
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?;:)\]]|$)/g,
    `$1${colors.italic}$2${colors.reset}`);

  // Re-insert links and inline code.
  out = out.replace(/\x00LINK(\d+)\x00/g, (_m, i) => linkSlots[Number(i)]);
  out = out.replace(/\x00CODE(\d+)\x00/g, (_m, i) => codeSlots[Number(i)]);

  return out;
}
