// Accuracy of the procedure tier on labeled lists (ADR 01213). The corpus is
// every non-explicit ordered list in this repo's docs and the agent-tools docs,
// each labeled by a reader who didn't see the tagger's result. A procedure's
// `actions` labels each item as an action or not. Lists with identical items
// count once. The floors ratchet: raise them when a change
// improves the numbers, and never lower them to make a change pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import { readsAsProcedure } from "../dist/audit/tagger.js";

const PRECISION_FLOOR = 0.93;
const RECALL_FLOOR = 0.95;

describe("audit tagger accuracy", function () {
  it("meets the precision and recall floors on the labeled corpus", function () {
    const corpus = JSON.parse(fs.readFileSync(new URL("./audit-tagger-corpus.json", import.meta.url), "utf8"));
    const seen = new Set();
    const lists = corpus.filter(({ items }) => !seen.has(JSON.stringify(items)) && seen.add(JSON.stringify(items)));
    let tp = 0, fp = 0, fn = 0;
    for (const { items, procedure } of lists) {
      const predicted = readsAsProcedure(items);
      if (predicted && procedure) tp++;
      else if (predicted) fp++;
      else if (procedure) fn++;
    }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    const summary = `${lists.length} lists: precision ${precision.toFixed(3)}, recall ${recall.toFixed(3)} (${fp} false positives, ${fn} misses)`;
    assert.ok(precision >= PRECISION_FLOOR && recall >= RECALL_FLOOR, summary);
  });
});
