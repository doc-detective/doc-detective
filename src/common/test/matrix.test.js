import assert from "node:assert/strict";
import {
  matrixReferences,
  matrixCombinations,
  substituteMatrix,
  matrixIdSuffix,
  checkMatrixPaths,
} from "../dist/matrix.js";

const variant = [
  { theme: "light", dpr: 1 },
  { theme: "dark", dpr: 2 },
];

describe("matrix helpers (ADR 01232)", function () {
  describe("matrixReferences", function () {
    it("collects keys from every string, at any depth", function () {
      const refs = matrixReferences({
        goTo: "https://x/$$matrix.locale/",
        screenshot: { path: "a-$$matrix.variant.theme.png" },
        list: ["$$matrix.page"],
      });
      assert.deepEqual([...refs].sort(), ["locale", "page", "variant"]);
    });

    it("ignores strings with no reference", function () {
      assert.equal(matrixReferences({ goTo: "$HOME", n: 2 }).size, 0);
    });
  });

  describe("matrixCombinations", function () {
    it("crosses only the referenced keys, in authored order", function () {
      const combos = matrixCombinations(
        { locale: ["en", "de"], unused: [1, 2, 3], variant },
        new Set(["variant", "locale"])
      );
      assert.equal(combos.length, 4);
      assert.deepEqual(combos[0], { locale: "en", variant: variant[0] });
      assert.deepEqual(Object.keys(combos[3]), ["locale", "variant"]);
      assert.deepEqual(combos[3], { locale: "de", variant: variant[1] });
    });

    it("returns one empty combination when nothing is referenced", function () {
      assert.deepEqual(matrixCombinations({ a: [1, 2] }, new Set()), [{}]);
    });
  });

  describe("substituteMatrix", function () {
    const combination = { locale: "de-DE", variant: variant[1], flag: true };

    it("keeps the type of a whole-string reference", function () {
      assert.equal(substituteMatrix("$$matrix.variant.dpr", combination), 2);
      assert.equal(substituteMatrix("$$matrix.flag", combination), true);
      assert.deepEqual(substituteMatrix("$$matrix.variant", combination), variant[1]);
    });

    it("splices a reference inside a longer string", function () {
      assert.equal(
        substituteMatrix("login-$$matrix.locale-$$matrix.variant.theme.png", combination),
        "login-de-DE-dark.png"
      );
      assert.equal(substituteMatrix("x-$$matrix.variant_y.png", { variant_y: "z" }), "x-z.png");
      assert.equal(substituteMatrix("x-$$matrix.variant-y.png", combination), "x-dark-2-y.png");
    });

    it("walks objects and arrays without mutating them", function () {
      const steps = [{ goTo: "https://x/$$matrix.locale/" }];
      const out = substituteMatrix(steps, combination);
      assert.deepEqual(out, [{ goTo: "https://x/de-DE/" }]);
      assert.equal(steps[0].goTo, "https://x/$$matrix.locale/");
    });

    it("throws on a field the object value doesn't have", function () {
      assert.throws(
        () => substituteMatrix("$$matrix.variant.size", combination),
        { message: "`$$matrix.variant.size` names no field of `matrix` key `variant`." }
      );
    });

    it("leaves non-strings, unknown keys, and trailing text alone", function () {
      assert.equal(substituteMatrix(3, combination), 3);
      assert.equal(substituteMatrix(null, combination), null);
      assert.equal(substituteMatrix("$$matrix.other", combination), "$$matrix.other");
      assert.equal(substituteMatrix("a $$matrix.other", combination), "a $$matrix.other");
      assert.equal(substituteMatrix("$$matrix.locale.png", combination), "de-DE.png");
    });

    it("ignores __proto__ keys", function () {
      const value = JSON.parse('{"__proto__": "$$matrix.locale", "a": "$$matrix.locale"}');
      const out = substituteMatrix(value, combination);
      assert.equal(out.a, "de-DE");
      assert.equal(Object.getPrototypeOf(out), Object.prototype);
    });
  });

  describe("matrixIdSuffix", function () {
    it("joins key=value parts, object leaves with `-`", function () {
      assert.equal(
        matrixIdSuffix({ locale: "de-DE", variant: variant[1] }),
        "~locale=de-DE~variant=dark-2"
      );
    });

    it("replaces characters that aren't filename-safe", function () {
      assert.equal(matrixIdSuffix({ page: "a/b c" }), "~page=a-b-c");
    });

    it("is empty for an empty combination", function () {
      assert.equal(matrixIdSuffix({}), "");
    });
  });

  describe("checkMatrixPaths", function () {
    const matrix = { locale: ["en", "de"], variant, one: ["x"] };
    const keys = ["locale", "variant", "one"];

    it("passes a path that references every varying key", function () {
      const steps = [{ screenshot: { path: "s-$$matrix.locale-$$matrix.variant.theme.png" } }];
      assert.deepEqual(checkMatrixPaths(steps, matrix, keys), []);
    });

    it("ignores a key the matrix doesn't have", function () {
      assert.deepEqual(checkMatrixPaths([{ screenshot: "a.png" }], {}, ["missing"]), []);
    });

    it("passes derived paths", function () {
      assert.deepEqual(checkMatrixPaths([{ screenshot: true }, { record: true }], matrix, keys), []);
    });

    it("names the first varying key each fixed path misses", function () {
      const steps = [
        { goTo: "https://x" },
        { screenshot: "/abs/login-$$matrix.locale.png" },
        { record: { path: "demo.mp4" } },
        { saveState: "state.json" },
        { saveCookie: "session" },
        { saveCookie: { name: "s", path: "s.txt" } },
      ];
      assert.deepEqual(checkMatrixPaths(steps, matrix, keys), [
        "step 2's `path` `/abs/login-$$matrix.locale.png` is the same for every `matrix` combination. Add `$$matrix.variant` to it.",
        "step 3's `path` `demo.mp4` is the same for every `matrix` combination. Add `$$matrix.locale` to it.",
        "step 4's `path` `state.json` is the same for every `matrix` combination. Add `$$matrix.locale` to it.",
        "step 6's `path` `s.txt` is the same for every `matrix` combination. Add `$$matrix.locale` to it.",
      ]);
    });
  });
});
