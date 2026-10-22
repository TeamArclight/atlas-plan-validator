import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePlanGraph,
  assertValidPlanGraph,
  PlanValidationError,
  BudgetExceededError,
  CyclicDependencyError,
  UnauthorizedToolError,
  MissingApprovalGateError,
  MalformedStepError,
  type PlanStep,
} from '../src/index.js';

test('1. Valid plan satisfies constraints and computes total cost', () => {
  const steps: PlanStep[] = [
    {
      id: 'step_venue',
      title: 'Book fictional venue',
      tool: 'venue_book',
      costBound: 12000,
      dependencies: [],
      requiresApproval: true,
    },
    {
      id: 'step_catering',
      title: 'Review catering quote',
      tool: 'catering_quote',
      costBound: 0,
      dependencies: ['step_venue'],
      requiresApproval: false,
    },
    {
      id: 'step_cake',
      title: 'Review cake quote',
      tool: 'cake_quote',
      costBound: 0,
      dependencies: ['step_venue'],
      requiresApproval: false,
    },
  ];

  const result = validatePlanGraph(steps, 20000, {
    allowedTools: ['venue_book', 'catering_quote', 'cake_quote'],
  });

  assert.equal(result.valid, true);
  assert.equal(result.totalCost, 12000);
  assert.equal(result.errors.length, 0);
  assert.equal(result.details.length, 0);

  // Asserting valid plan does not throw
  const asserted = assertValidPlanGraph(steps, 20000, {
    allowedTools: ['venue_book', 'catering_quote', 'cake_quote'],
  });
  assert.equal(asserted.valid, true);
});

test('2. Budget validation rejects plans exceeding allocation with counterexample gap', () => {
  const steps: PlanStep[] = [
    {
      id: 'step1',
      title: 'Luxury Venue',
      costBound: 35000,
      requiresApproval: true,
    },
    {
      id: 'step2',
      title: 'Premium Catering',
      costBound: 10000,
      requiresApproval: true,
    },
  ];

  const result = validatePlanGraph(steps, 40000);
  assert.equal(result.valid, false);
  assert.equal(result.totalCost, 45000);
  assert.match(result.errors[0], /exceeds allocated budget/);
  assert.match(result.errors[0], /Counterexample: cost gap is INR 5,000/);

  const detail = result.details.find((d) => d.code === 'BUDGET_EXCEEDED');
  assert.ok(detail);
  assert.equal(detail.counterexample?.costGap, 5000);

  assert.throws(
    () => assertValidPlanGraph(steps, 40000),
    (err: unknown) =>
      err instanceof BudgetExceededError &&
      (err.counterexample?.costGap as number) === 5000
  );
});

test('3. Exact budget boundary succeeds', () => {
  const steps: PlanStep[] = [
    {
      id: 'step1',
      title: 'Boundary Venue',
      costBound: 15000,
      requiresApproval: true,
    },
  ];

  const result = validatePlanGraph(steps, 15000);
  assert.equal(result.valid, true);
  assert.equal(result.totalCost, 15000);
});

test('4. Directed Acyclic Graph (DAG) cycle detection via Kahn topological sort', () => {
  // Direct 2-step cycle
  const cyclic2: PlanStep[] = [
    {
      id: 'stepA',
      title: 'Step A',
      dependencies: ['stepB'],
    },
    {
      id: 'stepB',
      title: 'Step B',
      dependencies: ['stepA'],
    },
  ];

  const res2 = validatePlanGraph(cyclic2, 10000);
  assert.equal(res2.valid, false);
  assert.match(res2.errors.join('; '), /Cyclic dependency detected/);

  assert.throws(
    () => assertValidPlanGraph(cyclic2, 10000),
    (err: unknown) => err instanceof CyclicDependencyError
  );

  // 3-step cycle
  const cyclic3: PlanStep[] = [
    { id: '1', title: 'One', dependencies: ['3'] },
    { id: '2', title: 'Two', dependencies: ['1'] },
    { id: '3', title: 'Three', dependencies: ['2'] },
  ];
  const res3 = validatePlanGraph(cyclic3, 10000);
  assert.equal(res3.valid, false);
  assert.match(res3.errors.join('; '), /Cyclic dependency detected/);
});

test('5. Self-dependency is detected and rejected', () => {
  const selfDep: PlanStep[] = [
    {
      id: 'step_loop',
      title: 'Self loop step',
      dependencies: ['step_loop'],
    },
  ];
  const result = validatePlanGraph(selfDep, 10000);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /cannot depend on itself/);
});

test('6. Missing dependency references are rejected', () => {
  const missingDep: PlanStep[] = [
    {
      id: 'step_a',
      title: 'Valid Step',
      dependencies: ['non_existent_step'],
    },
  ];
  const result = validatePlanGraph(missingDep, 10000);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /depends on non-existent step "non_existent_step"/);
});

test('7. Tool allowlist enforcement rejects unauthorized tools', () => {
  const steps: PlanStep[] = [
    {
      id: 'shell_step',
      title: 'Unauthorized Tool Step',
      tool: 'malicious_system_exec',
      costBound: 0,
      requiresApproval: false,
    },
  ];

  const result = validatePlanGraph(steps, 10000, {
    allowedTools: ['fictional_venue_book', 'fictional_catering_quote'],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Tool "malicious_system_exec" is not in the authorized tools allowlist/);

  assert.throws(
    () =>
      assertValidPlanGraph(steps, 10000, {
        allowedTools: ['fictional_venue_book', 'fictional_catering_quote'],
      }),
    (err: unknown) => err instanceof UnauthorizedToolError
  );
});

test('8. Missing approval gate on costly step is rejected', () => {
  const steps: PlanStep[] = [
    {
      id: 'spend_money',
      title: 'Financial commitment without gate',
      costBound: 5000,
      requiresApproval: false,
    },
  ];

  const result = validatePlanGraph(steps, 10000);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /incurs cost \(INR 5,000\) but does not require approval/);

  assert.throws(
    () => assertValidPlanGraph(steps, 10000),
    (err: unknown) => err instanceof MissingApprovalGateError
  );
});

test('9. Approval requirement can be bypassed with explicit option if non-financial', () => {
  const steps: PlanStep[] = [
    {
      id: 'automated_compute',
      title: 'Automated cluster computation',
      costBound: 500,
      requiresApproval: false,
    },
  ];

  const result = validatePlanGraph(steps, 1000, {
    requireApprovalForPaidSteps: false,
  });
  assert.equal(result.valid, true);
  assert.equal(result.totalCost, 500);
});

test('10. Structural step validation rejects malformed steps, empty titles, and duplicate IDs', () => {
  // Duplicate ID
  const dupSteps: PlanStep[] = [
    { id: 'dup', title: 'First Instance' },
    { id: 'dup', title: 'Second Instance' },
  ];
  const dupResult = validatePlanGraph(dupSteps, 1000);
  assert.equal(dupResult.valid, false);
  assert.match(dupResult.errors[0], /Duplicate step ID detected: "dup"/);

  // Missing title
  const noTitleSteps: PlanStep[] = [
    { id: 's1', title: '' },
  ];
  const noTitleResult = validatePlanGraph(noTitleSteps, 1000);
  assert.equal(noTitleResult.valid, false);
  assert.match(noTitleResult.errors[0], /must possess a non-empty string title/);

  // Empty ID
  const noIdSteps: PlanStep[] = [
    { id: '', title: 'Valid title' },
  ];
  const noIdResult = validatePlanGraph(noIdSteps, 1000);
  assert.equal(noIdResult.valid, false);
  assert.match(noIdResult.errors[0], /Each step must possess a unique non-empty string ID/);

  // Invalid costBound (negative or NaN)
  const negCostSteps: PlanStep[] = [
    { id: 's1', title: 'Negative cost', costBound: -500 },
  ];
  const negResult = validatePlanGraph(negCostSteps, 1000);
  assert.equal(negResult.valid, false);
  assert.match(negResult.errors[0], /costBound must be a non-negative finite number/);
});

test('11. Empty plan and step limits', () => {
  // Empty plan rejected by default
  const emptyRes = validatePlanGraph([], 1000);
  assert.equal(emptyRes.valid, false);
  assert.match(emptyRes.errors[0], /Plan contains no steps/);

  // Empty plan permitted when opted in
  const emptyResAllowed = validatePlanGraph([], 1000, { allowEmptySteps: true });
  assert.equal(emptyResAllowed.valid, true);
  assert.equal(emptyResAllowed.totalCost, 0);

  // Exceeding maxSteps
  const stepList: PlanStep[] = [
    { id: '1', title: 'One' },
    { id: '2', title: 'Two' },
    { id: '3', title: 'Three' },
  ];
  const maxStepRes = validatePlanGraph(stepList, 1000, { maxSteps: 2 });
  assert.equal(maxStepRes.valid, false);
  assert.match(maxStepRes.errors[0], /exceeds maximum permitted steps/);
});
