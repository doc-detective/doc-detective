// Generated stepIds are random UUIDs per run; drop them so runs compare.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalize(value) {
  return JSON.parse(
    JSON.stringify(value, (k, v) => (k === "stepId" && UUID_RE.test(v) ? undefined : v))
  );
}
