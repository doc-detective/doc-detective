// Annotation theme resolution. Pure: no driver, no image library, no I/O —
// so every branch here is unit-testable in-process.
//
// The schema (annotation_v3) is deliberately free of `default` keywords: it's
// shared by annotation objects and by the annotationDefaults theme at the
// config, spec, and test levels, and AJV's useDefaults would inject a default
// into all of them, populating the spec/test levels and destroying the
// "absent means defer to the level above" cascade. So the built-in theme lives
// here instead, and this module owns the whole defaulting story.

export {
  ANNOTATION_TYPES,
  BUILT_IN_THEME,
  STYLE_KEYS,
  resolveTheme,
  resolveAnnotation,
};
export type { AnnotationType, AnnotationStyle, AnnotationTheme, ResolvedAnnotation };

type AnnotationType =
  | "outline"
  | "arrow"
  | "badge"
  | "callout"
  | "blur"
  | "text";

const ANNOTATION_TYPES: AnnotationType[] = [
  "outline",
  "arrow",
  "badge",
  "callout",
  "blur",
  "text",
];

type AnnotationStyle = {
  color?: string;
  background?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontFamily?: string;
  opacity?: number;
  radius?: number;
  padding?: number;
  maxWidth?: number;
  intensity?: number;
};

// Keep in sync with the style schema in annotation_v3.
const STYLE_KEYS: (keyof AnnotationStyle)[] = [
  "color",
  "background",
  "strokeWidth",
  "fontSize",
  "fontFamily",
  "opacity",
  "radius",
  "padding",
  "maxWidth",
  "intensity",
];

type AnnotationTransition = {
  enter?: "none" | "fade" | "pop" | "draw";
  exit?: "none" | "fade";
  durationMs?: number;
};

type AnnotationTheme = AnnotationStyle & {
  transition?: AnnotationTransition;
} & Partial<Record<AnnotationType, AnnotationStyle>>;

type ResolvedAnnotation = {
  id?: string;
  type: AnnotationType;
  target: any;
  label?: string;
  style: Required<Pick<AnnotationStyle, "color">> & AnnotationStyle;
  transition: AnnotationTransition;
  placement?: any;
  track: boolean;
  duration?: number;
  all: boolean;
};

// The fallback every unset field lands on. `fontFamily` is a stack rather than
// a single face: the buffer renderer hands this to sharp/librsvg, which
// resolves fonts through the host's fontconfig, and the CI matrix spans three
// OSes with different faces installed. Ending in a generic family keeps text
// rendering on a box where neither named face exists.
const BUILT_IN_THEME: AnnotationTheme = {
  color: "#E11D48",
  background: "#1E293B",
  strokeWidth: 3,
  fontSize: 14,
  fontFamily: "Arial, Helvetica, sans-serif",
  opacity: 1,
  radius: 4,
  padding: 8,
  maxWidth: 280,
  intensity: 14,
  outline: {},
  arrow: {},
  badge: { background: "#E11D48", color: "#FFFFFF", fontSize: 13 },
  callout: { background: "#1E293B", color: "#F8FAFC" },
  blur: {},
  text: { background: "#1E293B", color: "#F8FAFC" },
  transition: { enter: "fade", exit: "fade", durationMs: 250 },
};

// Pick just the base style properties off a theme, dropping the per-type
// blocks and the transition.
function baseStyleOf(theme: AnnotationTheme): AnnotationStyle {
  const out: AnnotationStyle = {};
  for (const key of STYLE_KEYS) {
    if (theme[key] !== undefined) (out as any)[key] = theme[key];
  }
  return out;
}

// Merge theme levels in cascade order (config, then spec, then test), each
// level overriding the one before it, over the built-in theme. Levels are
// merged field-by-field rather than replaced wholesale: setting
// `badge: { background }` at the test level must not discard a
// `badge: { fontSize }` set at the config level.
function resolveTheme(levels: (AnnotationTheme | null | undefined)[]): AnnotationTheme {
  const out: AnnotationTheme = {
    ...baseStyleOf(BUILT_IN_THEME),
    transition: { ...BUILT_IN_THEME.transition },
  };
  for (const type of ANNOTATION_TYPES) {
    out[type] = { ...(BUILT_IN_THEME[type] ?? {}) };
  }

  for (const level of levels) {
    if (!level) continue;
    for (const key of STYLE_KEYS) {
      if (level[key] !== undefined) (out as any)[key] = level[key];
    }
    for (const type of ANNOTATION_TYPES) {
      if (level[type]) out[type] = { ...(out[type] ?? {}), ...level[type] };
    }
    if (level.transition) {
      out.transition = { ...(out.transition ?? {}), ...level.transition };
    }
  }
  return out;
}

// Fold a single annotation against a resolved theme into the shape the
// renderers consume. Style precedence, weakest to strongest:
//   built-in base -> theme base -> theme per-type -> the annotation's own style
function resolveAnnotation(
  annotation: any,
  theme: AnnotationTheme
): ResolvedAnnotation {
  // Both halves of "exactly one" are checked, not just the zero case: a
  // `.find()` on its own would silently pick the first key and draw an
  // `outline` for `{ outline, blur }`, quietly dropping the blur — the sort of
  // near-miss redaction this feature must never produce. Unreachable through a
  // validated step (annotation_v3's oneOf rejects both shapes); this guards
  // callers that build annotations programmatically and bypass validation.
  const types = ANNOTATION_TYPES.filter(
    (candidate) => annotation?.[candidate] !== undefined
  );
  if (types.length !== 1) {
    throw new Error(
      `An annotation must name exactly one of: ${ANNOTATION_TYPES.join(", ")}.` +
        (types.length > 1 ? ` Found ${types.length}: ${types.join(", ")}.` : "")
    );
  }
  const type = types[0];

  const style: AnnotationStyle = {
    ...baseStyleOf(theme),
    ...(theme[type] ?? {}),
    ...(annotation.style ?? {}),
  };

  return {
    id: annotation.id,
    type,
    target: annotation[type],
    label: annotation.label,
    style: style as ResolvedAnnotation["style"],
    transition: { ...(theme.transition ?? {}), ...(annotation.transition ?? {}) },
    placement: annotation.position,
    track: annotation.track === true,
    duration: annotation.duration,
    all: annotation.all === true,
  };
}
