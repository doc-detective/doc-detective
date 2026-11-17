/**
 * Decides whether a list item reads as an instruction, using compromise's
 * lexicon-based tagger. Deterministic: no model, no network. The contract
 * cases live in test/audit-tagger.test.js (ADR 01207).
 */

import nlp from "compromise";

// UI verbs compromise's lexicon reads as nouns or adjectives.
const UI_VERBS = new Set(["hover", "tap", "select", "preview"]);

// An imperative takes an object or a complement: "the", "your", "it", a UI
// label, "to", "in", "sure". A bare noun after the verb reads as a noun
// phrase instead, as in "Release notes" or "Start date".
// Bold text is a UI label, read as this placeholder. "Zed" is a proper noun
// to the tagger, while a word like "Label" reads as a verb.
const LABEL = "Zed";

const COMPLEMENTS = ["#Determiner", "#Pronoun", "#Possessive", "#Preposition", "#Particle", "#ProperNoun", "#Value", "#Adjective", "#Conjunction"];

/**
 * Rewrites Markdown-flavored item text into plain words the tagger reads
 * well. Returns the text as is, then without a short opener, then also
 * without a leading adverb, so "Apply the patch" and "Open the file, then
 * save it" still read from their first word.
 */
function readings(text: string): string[] {
  const plain = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images keep their text
    .replace(/`[^`]*`/g, "it") // inline code reads as an object
    .replace(/(\*\*|__)([^*_]+)\1/g, LABEL)
    .replace(/[*_]+/g, "")
    .replace(/\b(?:double|right|left|triple)-click\b/gi, "click")
    .replace(/\bre-(?=[a-z])/gi, "") // "Re-run" reads as "run"
    .replace(/\s+/g, " ")
    .trim();
  // An emoji, "(Optional)", a sequence word, or a negation before the verb, as
  // in "✅ Follow the steps", "Then click Save", or "Don't close the window".
  const lead = plain
    .replace(/^\p{Extended_Pictographic}[\p{Extended_Pictographic}️\s]*/u, "")
    .replace(/^\(optional\)\s*/i, "")
    .replace(/^(?:then|now|next|finally|lastly|please|just|simply|also|do not|don't|never),?\s+/i, "");
  // Up to two short openers before a comma, as in "In a terminal, from the
  // repo folder, run it".
  let rest = lead;
  for (let i = 0; i < 2; i++) {
    const opener = /^([^,.:;]{1,60}),\s+/.exec(rest);
    if (!opener || opener[1].split(" ").length > 5) break;
    rest = rest.slice(opener[0].length);
  }
  // A leading word ending in "ly", for an adverb as in "Briefly state the
  // concept". It also strips verbs like "Apply", which the other readings keep.
  return [plain, lead, rest, rest.replace(/^[A-Za-z]+ly\s+(?=\S)/, "")];
}

/** True when at least half the items read as instructions. */
export function readsAsProcedure(items: string[]): boolean {
  return items.length > 0 && items.filter(isInstruction).length * 2 >= items.length;
}

/** True when `text` starts with an imperative verb, so it reads as an instruction. */
export function isInstruction(text: string): boolean {
  // A bold lead-in of two or more words is the step itself, as in "**Create a
  // branch**: …", or a term it defines, as in "**Exact match** - …". One word
  // names or labels the step, as in "**Commit**: Run …" or "**Optional:** …",
  // so the text after it is read instead.
  const bold = /^\s*(\*\*|__)(.+?)\1\s*[:.\-–—]?\s*([\s\S]*)$/.exec(text);
  if (bold) {
    const term = bold[2].replace(/[:.]\s*$/, "").trim();
    return isInstruction(term.split(/\s+/).length > 1 ? term : bold[3]);
  }
  return [...new Set(readings(text))].some(startsWithImperative);
}

function startsWithImperative(plain: string): boolean {
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
