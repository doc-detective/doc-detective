/**
 * Decides whether a list item reads as an instruction, using compromise's
 * lexicon-based tagger. Deterministic: no model, no network. The contract
 * cases live in test/audit-tagger.test.js (ADR 01213).
 */

import nlp from "compromise";

// UI verbs compromise's lexicon reads as nouns or adjectives.
const UI_VERBS = new Set(["hover", "tap", "select", "preview"]);

// An imperative takes an object or a complement: "the", "your", "it", a UI
// label, "to", "in", "sure". A bare noun after the verb reads as a noun
// phrase instead, as in "Release notes" or "Start date".
const COMPLEMENTS = ["#Determiner", "#Pronoun", "#Possessive", "#Preposition", "#Particle", "#ProperNoun", "#Value", "#Adjective", "#Conjunction"];

/** Rewrites Markdown-flavored item text into plain words the tagger reads well. */
function normalize(text: string): string {
  let plain = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images keep their text
    .replace(/`[^`]*`/g, "it") // inline code reads as an object
    // Bold is a UI label. "Zed" is a proper noun to the tagger; "Label" reads as a verb.
    .replace(/(\*\*|__)([^*_]+)\1/g, "Zed")
    .replace(/[*_]+/g, "")
    .replace(/\b(?:double|right|left|triple)-click\b/gi, "click")
    .replace(/\bre-(?=[a-z])/gi, "") // "Re-run" reads as "run"
    .replace(/\s+/g, " ")
    .trim();
  // A short opener before a comma, as in "In a terminal, run it".
  const opener = /^([^,.:;]{1,60}),\s+/.exec(plain);
  if (opener && opener[1].split(" ").length <= 5) plain = plain.slice(opener[0].length);
  // A leading adverb, as in "Briefly state the concept".
  return plain.replace(/^[A-Za-z]+ly\s+(?=\S)/, "");
}

/** True when `text` starts with an imperative verb, so it reads as an instruction. */
export function isInstruction(text: string): boolean {
  // An item that opens with a bold term defines the term, as in "**Exact match** - …".
  if (/^\s*(\*\*|__)/.test(text)) return false;
  const plain = normalize(text);
  if (!plain) return false;
  const terms = nlp(plain).terms();
  const first = terms.eq(0);
  const word = first.text().toLowerCase();
  if (word.endsWith(":")) return false; // a label, such as "Note:"
  const verb = UI_VERBS.has(word) || first.has("#Imperative") || first.has("#Infinitive");
  if (!verb) return false;
  const second = terms.eq(1);
  if (!second.found) return first.has("#Verb");
  return UI_VERBS.has(word) && second.has("#Noun") ? true : COMPLEMENTS.some((tag) => second.has(tag));
}
