import assert from "node:assert/strict";
import {
  ANNOTATION_TYPES,
  BUILT_IN_THEME,
  resolveTheme,
  resolveAnnotation,
} from "../dist/core/annotations/model.js";

describe("annotations/model", function () {
  describe("ANNOTATION_TYPES", function () {
    it("lists the six v1 types", function () {
      assert.deepEqual(ANNOTATION_TYPES, [
        "outline",
        "arrow",
        "badge",
        "callout",
        "blur",
        "text",
      ]);
    });
  });

  describe("resolveTheme", function () {
    it("returns the built-in theme when no levels are set", function () {
      const theme = resolveTheme([]);
      assert.equal(theme.color, BUILT_IN_THEME.color);
      assert.equal(theme.strokeWidth, BUILT_IN_THEME.strokeWidth);
    });

    it("ignores undefined and null levels", function () {
      const theme = resolveTheme([undefined, null, undefined]);
      assert.equal(theme.color, BUILT_IN_THEME.color);
    });

    it("lets later levels win over earlier ones", function () {
      // config -> spec -> test, so test wins.
      const theme = resolveTheme([
        { color: "#111111", strokeWidth: 1 },
        { color: "#222222" },
        { color: "#333333" },
      ]);
      assert.equal(theme.color, "#333333");
      assert.equal(theme.strokeWidth, 1);
    });

    it("merges per-type overrides across levels instead of replacing them", function () {
      const theme = resolveTheme([
        { badge: { background: "#AAA", fontSize: 10 } },
        { badge: { background: "#BBB" } },
      ]);
      assert.equal(theme.badge.background, "#BBB");
      assert.equal(theme.badge.fontSize, 10);
    });

    it("merges the transition across levels", function () {
      const theme = resolveTheme([
        { transition: { enter: "pop", durationMs: 100 } },
        { transition: { durationMs: 400 } },
      ]);
      assert.equal(theme.transition.enter, "pop");
      assert.equal(theme.transition.durationMs, 400);
    });

    it("does not mutate the built-in theme", function () {
      const before = BUILT_IN_THEME.color;
      resolveTheme([{ color: "#000000", badge: { color: "#000000" } }]);
      assert.equal(BUILT_IN_THEME.color, before);
      assert.notEqual(BUILT_IN_THEME.badge.color, "#000000");
    });
  });

  describe("resolveAnnotation", function () {
    const theme = resolveTheme([]);

    it("identifies the type and target of a string-target annotation", function () {
      const resolved = resolveAnnotation({ outline: "#submit" }, theme);
      assert.equal(resolved.type, "outline");
      assert.equal(resolved.target, "#submit");
    });

    it("identifies an object target", function () {
      const target = { elementTestId: "cvv" };
      const resolved = resolveAnnotation({ callout: target }, theme);
      assert.equal(resolved.type, "callout");
      assert.deepEqual(resolved.target, target);
    });

    it("applies style precedence: annotation over per-type over base", function () {
      const t = resolveTheme([
        { color: "#BASE0", strokeWidth: 2, badge: { color: "#TYPE0" } },
      ]);
      // Base only -> base wins.
      assert.equal(resolveAnnotation({ outline: "#a" }, t).style.color, "#BASE0");
      // Per-type overrides base.
      assert.equal(resolveAnnotation({ badge: "#a" }, t).style.color, "#TYPE0");
      // Annotation style overrides per-type.
      assert.equal(
        resolveAnnotation({ badge: "#a", style: { color: "#OWN00" } }, t).style
          .color,
        "#OWN00"
      );
      // Unrelated base props still flow through.
      assert.equal(resolveAnnotation({ badge: "#a" }, t).style.strokeWidth, 2);
    });

    it("merges the annotation's transition over the theme's", function () {
      const t = resolveTheme([
        { transition: { enter: "fade", exit: "fade", durationMs: 250 } },
      ]);
      const resolved = resolveAnnotation(
        { blur: "#a", transition: { enter: "none" } },
        t
      );
      assert.equal(resolved.transition.enter, "none");
      assert.equal(resolved.transition.exit, "fade");
      assert.equal(resolved.transition.durationMs, 250);
    });

    it("carries the behavioral fields through", function () {
      const resolved = resolveAnnotation(
        {
          id: "redact",
          blur: "#a",
          all: true,
          track: true,
          duration: 3500,
          position: "right",
          label: "hi",
        },
        theme
      );
      assert.equal(resolved.id, "redact");
      assert.equal(resolved.all, true);
      assert.equal(resolved.track, true);
      assert.equal(resolved.duration, 3500);
      assert.equal(resolved.placement, "right");
      assert.equal(resolved.label, "hi");
    });

    it("defaults all and track to false when unset", function () {
      const resolved = resolveAnnotation({ outline: "#a" }, theme);
      assert.equal(resolved.all, false);
      assert.equal(resolved.track, false);
    });

    it("throws when no type key is present", function () {
      // Schema validation rejects this first; the throw is a guard for
      // callers that bypass validation.
      assert.throws(() => resolveAnnotation({ label: "orphan" }, theme));
    });

    it("throws when more than one type key is present", function () {
      // Picking the first key would draw an outline and silently drop the
      // blur — a near-miss redaction. Both halves of "exactly one" are
      // enforced, not just the zero case.
      assert.throws(
        () => resolveAnnotation({ outline: "#a", blur: "#b" }, theme),
        /exactly one/
      );
    });
  });
});
