import assert from "node:assert/strict";
import {
  annotationsToSvg,
  escapeXml,
  wrapText,
  anchorPoint,
} from "../dist/core/annotations/svg.js";
import { resolveTheme, resolveAnnotation } from "../dist/core/annotations/model.js";

const theme = resolveTheme([]);
const CANVAS = { width: 800, height: 600 };

// Build a placed annotation the way the geometry layer hands them over:
// the resolved annotation plus a rect already in image pixels.
function place(annotation, rect = { x: 100, y: 100, width: 200, height: 50 }) {
  return { ...resolveAnnotation(annotation, theme), rect };
}

describe("annotations/svg", function () {
  describe("escapeXml", function () {
    it("escapes the five XML metacharacters", function () {
      assert.equal(
        escapeXml(`<a href="x" & 'y'>`),
        "&lt;a href=&quot;x&quot; &amp; &apos;y&apos;&gt;"
      );
    });

    it("leaves plain text untouched", function () {
      assert.equal(escapeXml("Enter your username"), "Enter your username");
    });
  });

  describe("wrapText", function () {
    it("returns a single line when the text fits", function () {
      assert.deepEqual(wrapText("short", 400, 14), ["short"]);
    });

    it("wraps on word boundaries", function () {
      const lines = wrapText("alpha beta gamma delta", 60, 14);
      assert.ok(lines.length > 1);
      // No word is split across lines.
      assert.equal(lines.join(" "), "alpha beta gamma delta");
    });

    it("does not drop a word longer than the max width", function () {
      const lines = wrapText("supercalifragilistic", 20, 14);
      assert.equal(lines.join(""), "supercalifragilistic");
    });

    it("collapses whitespace runs", function () {
      assert.deepEqual(wrapText("a   b", 400, 14), ["a b"]);
    });
  });

  describe("anchorPoint", function () {
    const rect = { x: 100, y: 200, width: 40, height: 20 };

    it("resolves named regions against a rect", function () {
      assert.deepEqual(anchorPoint(rect, "top-left"), { x: 100, y: 200 });
      assert.deepEqual(anchorPoint(rect, "bottom-right"), { x: 140, y: 220 });
      assert.deepEqual(anchorPoint(rect, "center"), { x: 120, y: 210 });
      assert.deepEqual(anchorPoint(rect, "top"), { x: 120, y: 200 });
      assert.deepEqual(anchorPoint(rect, "right"), { x: 140, y: 210 });
      assert.deepEqual(anchorPoint(rect, "left"), { x: 100, y: 210 });
      assert.deepEqual(anchorPoint(rect, "bottom"), { x: 120, y: 220 });
      assert.deepEqual(anchorPoint(rect, "top-right"), { x: 140, y: 200 });
      assert.deepEqual(anchorPoint(rect, "bottom-left"), { x: 100, y: 220 });
    });

    it("defaults to center for an unknown region", function () {
      assert.deepEqual(anchorPoint(rect, undefined), { x: 120, y: 210 });
    });
  });

  describe("annotationsToSvg", function () {
    it("emits an svg sized to the canvas", function () {
      const { svg } = annotationsToSvg([place({ outline: "#a" })], CANVAS);
      assert.match(svg, /^<svg /);
      assert.match(svg, /width="800"/);
      assert.match(svg, /height="600"/);
      assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.match(svg, /<\/svg>$/);
    });

    it("emits an empty-but-valid svg for no annotations", function () {
      const { svg, blurRegions } = annotationsToSvg([], CANVAS);
      assert.match(svg, /^<svg /);
      assert.deepEqual(blurRegions, []);
    });

    describe("outline", function () {
      it("draws a stroked, unfilled rect around the target", function () {
        const { svg } = annotationsToSvg([place({ outline: "#a" })], CANVAS);
        assert.match(svg, /<rect /);
        assert.match(svg, /fill="none"/);
        assert.match(svg, /stroke="#E11D48"/);
      });

      it("expands the rect by the style padding", function () {
        const { svg } = annotationsToSvg(
          [
            place({ outline: "#a", style: { padding: 10 } }, {
              x: 100,
              y: 100,
              width: 200,
              height: 50,
            }),
          ],
          CANVAS
        );
        // Padded out by 10 on each side.
        assert.match(svg, /x="90"/);
        assert.match(svg, /y="90"/);
        assert.match(svg, /width="220"/);
        assert.match(svg, /height="70"/);
      });

      it("honors a style color override", function () {
        const { svg } = annotationsToSvg(
          [place({ outline: "#a", style: { color: "#00FF00" } })],
          CANVAS
        );
        assert.match(svg, /stroke="#00FF00"/);
      });
    });

    describe("blur", function () {
      it("emits a blur region instead of svg markup", function () {
        const { svg, blurRegions } = annotationsToSvg(
          [
            place({ blur: "#a" }, { x: 10, y: 20, width: 30, height: 40 }),
          ],
          CANVAS
        );
        assert.equal(blurRegions.length, 1);
        assert.deepEqual(blurRegions[0].rect, {
          x: 10,
          y: 20,
          width: 30,
          height: 40,
        });
        assert.equal(blurRegions[0].intensity, 14);
        // Blur is a raster op; nothing is drawn into the overlay for it.
        assert.doesNotMatch(svg, /<rect /);
      });

      it("carries an intensity override", function () {
        const { blurRegions } = annotationsToSvg(
          [place({ blur: "#a", style: { intensity: 22 } })],
          CANVAS
        );
        assert.equal(blurRegions[0].intensity, 22);
      });

      it("clamps a blur region to the canvas", function () {
        const { blurRegions } = annotationsToSvg(
          [place({ blur: "#a" }, { x: -10, y: -10, width: 50, height: 50 })],
          CANVAS
        );
        assert.equal(blurRegions[0].rect.x, 0);
        assert.equal(blurRegions[0].rect.y, 0);
        assert.equal(blurRegions[0].rect.width, 40);
        assert.equal(blurRegions[0].rect.height, 40);
      });

      it("drops a blur region that lies entirely outside the canvas", function () {
        const { blurRegions } = annotationsToSvg(
          [place({ blur: "#a" }, { x: 900, y: 900, width: 50, height: 50 })],
          CANVAS
        );
        assert.deepEqual(blurRegions, []);
      });
    });

    describe("badge", function () {
      it("draws a circle and the label text", function () {
        const { svg } = annotationsToSvg(
          [place({ badge: "#a", label: "2" })],
          CANVAS
        );
        assert.match(svg, /<circle /);
        assert.match(svg, /<text /);
        assert.match(svg, />2<\/text>/);
      });

      it("escapes a label", function () {
        const { svg } = annotationsToSvg(
          [place({ badge: "#a", label: "<3" })],
          CANVAS
        );
        assert.match(svg, /&lt;3/);
        assert.doesNotMatch(svg, /><3</);
      });
    });

    describe("callout", function () {
      it("draws a leader line, a box, and wrapped text", function () {
        const { svg } = annotationsToSvg(
          [
            place({
              callout: "#a",
              label: "Never stored — sent to the processor",
              style: { maxWidth: 80 },
            }),
          ],
          CANVAS
        );
        assert.match(svg, /<line /);
        assert.match(svg, /<rect /);
        // Wrapped into multiple <text> lines.
        assert.ok((svg.match(/<text /g) || []).length > 1);
      });
    });

    describe("arrow", function () {
      it("draws a line and an arrowhead polygon", function () {
        const { svg } = annotationsToSvg([place({ arrow: "#a" })], CANVAS);
        assert.match(svg, /<line /);
        assert.match(svg, /<polygon /);
      });
    });

    describe("text", function () {
      it("draws a background box and the label", function () {
        const { svg } = annotationsToSvg(
          [place({ text: { position: "top-right" }, label: "Demo data" })],
          CANVAS
        );
        assert.match(svg, /<rect /);
        assert.match(svg, />Demo data</);
      });
    });

    it("renders multiple annotations into one overlay", function () {
      const { svg, blurRegions } = annotationsToSvg(
        [
          place({ outline: "#a" }),
          place({ badge: "#b", label: "1" }),
          place({ blur: "#c" }),
        ],
        CANVAS
      );
      assert.match(svg, /<rect /);
      assert.match(svg, /<circle /);
      assert.equal(blurRegions.length, 1);
    });

    it("applies opacity from the resolved style", function () {
      const { svg } = annotationsToSvg(
        [place({ outline: "#a", style: { opacity: 0.5 } })],
        CANVAS
      );
      assert.match(svg, /opacity="0.5"/);
    });

    it("produces no NaN coordinates for a zero-size target rect", function () {
      const { svg } = annotationsToSvg(
        [
          place({ arrow: { position: { x: 5, y: 5 } } }, {
            x: 5,
            y: 5,
            width: 0,
            height: 0,
          }),
        ],
        CANVAS
      );
      assert.doesNotMatch(svg, /NaN/);
    });
  });
});
