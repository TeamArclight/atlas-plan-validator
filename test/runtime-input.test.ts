import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanGraph } from '../src/validator.js';
import type { PlanStep } from '../src/types.js';

test('runtime JSON cannot bypass approval with a truthy string or omit an allowlisted tool', () => {
  const malformed = { id: 'paid', title: 'Paid action', tool: 'book', costBound: 100, requiresApproval: 'false' } as unknown as PlanStep;
  const result = validatePlanGraph([malformed], 1000, { allowedTools: ['book'] });
  assert.equal(result.valid, false);
  assert.ok(result.details.some(error => error.code === 'MISSING_APPROVAL_GATE'));
  const missingTool = { id: 'missing', title: 'Missing tool', costBound: 0 };
  assert.equal(validatePlanGraph([missingTool], 1000, { allowedTools: ['book'] }).valid, false);
});
