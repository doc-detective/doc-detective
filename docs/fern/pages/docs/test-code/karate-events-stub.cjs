// STUB, not Karate: prints the SUITE_EXIT line that `karate run -f karate:jsonl`
// writes to karate-events.jsonl, so karate-suite.mdx's inline test can read a
// Karate 2.x-shaped summary without Java or Karate installed.
const summary = {
  featureCount: 2,
  featuresPassed: 2,
  featuresFailed: 0,
  scenarioCount: 3,
  scenariosPassed: 3,
  scenariosFailed: 0,
  scenariosSkipped: 0,
  passed: true,
  durationMillis: 1234,
};
console.log(JSON.stringify({ type: 'SUITE_EXIT', data: { summary } }));
