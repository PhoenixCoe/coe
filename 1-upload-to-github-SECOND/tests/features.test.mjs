// Run with: npm test   (Node 22+). Checks the feature list that Settings > About shows.
import assert from 'node:assert/strict';
import { FEATURES, FEATURE_GROUPS } from '../src/lib/coe/features.ts';

assert.ok(FEATURES.length >= 75, `Coe lists ${FEATURES.length} features, it should list at least 75`);
const groups = new Set(FEATURE_GROUPS.map((g) => g.id));
for (const f of FEATURES) {
  assert.ok(groups.has(f.group), `"${f.title}" is in an unknown group`);
  assert.ok(f.title.length >= 3 && f.title.length <= 48, `"${f.title}" has an odd title length`);
  assert.ok(f.text.length >= 15 && f.text.length <= 190, `"${f.title}" needs a one-line description of 15 to 190 characters`);
}
assert.equal(new Set(FEATURES.map((f) => f.title)).size, FEATURES.length, 'two features share a title');
for (const g of FEATURE_GROUPS) assert.ok(FEATURES.some((f) => f.group === g.id), `group "${g.name}" is empty`);
assert.ok(FEATURES.filter((f) => f.wow).length >= 20, 'there should be at least 20 headline features');
console.log(`ok  ${FEATURES.length} features in ${FEATURE_GROUPS.length} groups, ${FEATURES.filter((f) => f.wow).length} headline`);
