// Pure helpers for native app surfaces (phase A1 of
// docs/design/native-app-surfaces.md): identifier classification, default
// surface naming, native-selector escape-hatch classification, and the
// per-platform semantic-locator mappings (A1 ships the Windows/UIA column).
// Everything in this module is pure — no driver, no fs, no env — so the
// contracts stay unit-testable without a Windows host.

export {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
};

type AppIdentifierKind = "path" | "aumid" | "id";

// Classify an `app` identifier by syntax — never by a user-supplied type enum:
// a `!` marks a UWP AppUserModelID, a path separator (or drive prefix) marks a
// filesystem path, a reverse-DNS token marks a bundle/package/desktop-file id,
// and anything else is treated as a (relative) executable path.
function classifyAppIdentifier(app: string): AppIdentifierKind {
  if (app.includes("!")) return "aumid";
  if (/[\\/]/.test(app) || /^[A-Za-z]:/.test(app)) return "path";
  if (/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){2,}$/.test(app)) return "id";
  return "path";
}

// The default surface-registry name for an app: the executable basename
// without extension for paths (`notepad.exe` → `notepad`,
// `Calculator.app` → `Calculator`), the final dot-segment for reverse-DNS ids
// (`com.apple.TextEdit` → `TextEdit`), and the package family name's app token
// (before the publisher-hash suffix) for AUMIDs
// (`Microsoft.WindowsCalculator_8wekyb3d8bbwe!App` → `WindowsCalculator`).
function defaultAppSurfaceName(app: string): string {
  const kind = classifyAppIdentifier(app);
  if (kind === "aumid") {
    const familyName = app.split("!")[0];
    const lastSegment = familyName.split(".").pop() ?? familyName;
    return lastSegment.split("_")[0] || app;
  }
  if (kind === "id") {
    return app.split(".").pop() || app;
  }
  const basename = app.split(/[\\/]/).pop() ?? app;
  const withoutExtension = basename.replace(/\.[A-Za-z0-9]+$/, "");
  return withoutExtension || basename;
}

type NativeSelectorKind = "xpath" | "accessibilityId" | "css";

// The `selector` escape hatch on app surfaces accepts platform-native
// locators, detected by syntax: `//…`/`(…` is XPath (every native driver
// speaks it), `~…` is an accessibility id. Anything else is CSS — browser-only,
// so callers reject it on app surfaces with a pointer to these forms.
function classifyNativeSelector(selector: string): NativeSelectorKind {
  if (selector.startsWith("//") || selector.startsWith("(")) return "xpath";
  if (selector.startsWith("~")) return "accessibilityId";
  return "css";
}

// Escape a value for embedding in an XPath string literal. Values without
// double quotes embed directly; values with them use concat() (XPath 1.0 has
// no character escaping inside literals).
function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  const parts = value
    .split('"')
    .map((part) => `"${part}"`)
    .join(`, '"', `);
  return `concat(${parts})`;
}

// Map an ARIA-ish role to a UIA ControlType tag (XPath element name in the
// Windows driver's XML view). Unknown roles pass through capitalized so new
// control types work without a table update.
function uiaControlType(role: string): string {
  const known: Record<string, string> = {
    button: "Button",
    checkbox: "CheckBox",
    combobox: "ComboBox",
    dialog: "Window",
    document: "Document",
    link: "Hyperlink",
    list: "List",
    listitem: "ListItem",
    menu: "Menu",
    menuitem: "MenuItem",
    radio: "RadioButton",
    slider: "Slider",
    tab: "TabItem",
    table: "Table",
    text: "Text",
    textbox: "Edit",
    toolbar: "ToolBar",
    tree: "Tree",
    treeitem: "TreeItem",
    window: "Window",
  };
  return (
    known[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1)
  );
}

// Build a Windows (UIA) locator from the shared semantic element fields —
// the A1 column of the design's mapping table: elementText → @Name,
// elementId → AutomationId, elementAria → ControlType (+ @Name),
// elementTestId → AutomationId. Returns null when no supported field is
// present (the caller reports which fields ARE supported on app surfaces).
// A lone elementId/elementTestId uses the driver's "accessibility id"
// strategy (the AutomationId fast path); anything combined compiles to XPath.
function buildUiaLocator(criteria: {
  elementText?: string;
  elementId?: string;
  elementTestId?: string;
  elementAria?: { role?: string; name?: string } | string;
  [key: string]: any;
}): { strategy: string; value: string } | null {
  const automationId = criteria.elementId ?? criteria.elementTestId;
  const aria =
    typeof criteria.elementAria === "string"
      ? { name: criteria.elementAria }
      : criteria.elementAria;

  const predicates: string[] = [];
  if (automationId !== undefined)
    predicates.push(`@AutomationId=${xpathLiteral(automationId)}`);
  if (criteria.elementText !== undefined)
    predicates.push(`@Name=${xpathLiteral(criteria.elementText)}`);
  if (aria?.name !== undefined)
    predicates.push(`@Name=${xpathLiteral(aria.name)}`);

  const tag = aria?.role ? uiaControlType(aria.role) : undefined;

  if (!tag && predicates.length === 0) return null;

  // Fast path: a lone AutomationId maps to the accessibility id strategy.
  if (
    automationId !== undefined &&
    predicates.length === 1 &&
    !tag &&
    criteria.elementText === undefined
  ) {
    return { strategy: "accessibility id", value: automationId };
  }

  const predicate = predicates.length ? `[${predicates.join(" and ")}]` : "";
  return { strategy: "xpath", value: `//${tag ?? "*"}${predicate}` };
}
