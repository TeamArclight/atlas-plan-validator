# atlas-plan-validator

> Deterministic graph, budget, and approval constraint validator for AI agent missions.

`atlas-plan-validator` is a provider-independent TypeScript library that validates multi-step mission plans formulated by AI planners (such as Google Gemini, Amazon Bedrock, Anthropic Claude, OpenAI, or local deterministic engines).

It protects real-world and simulated environments by enforcing strict structural, financial, and dependency invariants **before** any plan step is dispatched or executed.

---

## Why `atlas-plan-validator`?

Modern LLM-powered planners frequently generate multi-step task graphs. However, LLMs can inadvertently:
1. Introduce **circular dependencies** (e.g., Step A requires Step B, which requires Step A), causing deadlocks.
2. Exceed allocated **cost budgets** or omit financial bounds.
3. Call **unauthorized tools** or fabricate tool signatures.
4. Attempt to execute **irreversible or costly actions** without explicit human approval gates.
5. Reference non-existent steps or produce duplicate step identifiers.

The validator checks declared costs, graph structure, tool allowlists, and approval flags. It does not authenticate approvers, enforce external prices, or authorize execution. Applications must enforce these controls when performing actions.

---

## Key Features

- **Topological Cycle Detection**: Employs Kahn's algorithm to mathematically guarantee DAG acyclicity, catching both direct and multi-hop cycles.
- **Budget Upper Bounds & Counterexamples**: Computes aggregate plan costs and generates informative counterexamples highlighting the exact cost gap when over-budget.
- **Tool Allowlist Enforcement**: Restricts plan steps strictly to permitted tool names.
- **Human-in-the-Loop Approval Gates**: Enforces mandatory approval flags for any action incurring declared financial costs. Sensitive nonfinancial effects require application policy.
- **Structural Sanity**: Verifies step ID uniqueness, non-empty titles, non-negative finite costs, and dependency referential integrity.
- **Zero External Dependencies**: Lightweight, dependency-free core with 100% type safety.
- **Provider Agnostic**: Independent of Express, AWS, Gemini, or any specific orchestrator.

---

## Installation

```bash
git clone https://github.com/TeamArclight/atlas-plan-validator.git
cd atlas-plan-validator
npm install
npm test
npm run build
```

Or reference locally in a monorepo workspace:

```json
{
  "dependencies": {
    "atlas-plan-validator": "file:contributions/atlas-plan-validator"
  }
}
```

---

## Quick Start

### 1. Validating a Plan Graph

```typescript
import { validatePlanGraph, type PlanStep } from 'atlas-plan-validator';

const steps: PlanStep[] = [
  {
    id: 'venue_booking',
    title: 'Reserve celebration hall',
    tool: 'fictional_venue_book',
    costBound: 12000,
    dependencies: [],
    requiresApproval: true,
  },
  {
    id: 'catering_quote',
    title: 'Obtain buffet quote for 25 guests',
    tool: 'fictional_catering_quote',
    costBound: 0,
    dependencies: ['venue_booking'],
    requiresApproval: false,
  },
];

const budget = 20000;
const options = {
  allowedTools: ['fictional_venue_book', 'fictional_catering_quote'],
  currency: 'INR',
};

const result = validatePlanGraph(steps, budget, options);

if (!result.valid) {
  console.error('Plan rejected:', result.errors);
} else {
  console.log(`Plan approved. Total cost: INR ${result.totalCost}`);
}
```

### 2. Asserting and Handling Typed Exceptions

Use `assertValidPlanGraph` to throw typed errors with machine-readable counterexamples:

```typescript
import {
  assertValidPlanGraph,
  BudgetExceededError,
  CyclicDependencyError,
  UnauthorizedToolError,
  MissingApprovalGateError,
} from 'atlas-plan-validator';

try {
  assertValidPlanGraph(steps, budget, options);
} catch (error) {
  if (error instanceof BudgetExceededError) {
    console.error('Budget exceeded by:', error.counterexample?.costGap);
  } else if (error instanceof CyclicDependencyError) {
    console.error('Plan contains a deadlocking dependency loop.');
  } else if (error instanceof UnauthorizedToolError) {
    console.error('Plan attempted to call an unauthorized tool.');
  } else if (error instanceof MissingApprovalGateError) {
    console.error('A paid step did not specify requiresApproval: true.');
  }
}
```

---

## API Reference

### `validatePlanGraph(steps, budget, options?)`

Evaluates plan constraints deterministically and returns a validation summary.

- **Parameters**:
  - `steps: PlanStep[]`: The list of plan steps to inspect.
  - `budget: number`: Maximum allowed budget upper bound.
  - `options?: PlanValidationOptions`:
    - `allowedTools?: Set<string> | string[]`: Allowed tool names.
    - `currency?: string`: Currency code used in formatted messages (default: `'INR'`).
    - `requireApprovalForPaidSteps?: boolean`: Enforce approval on steps with `costBound > 0` (default: `true`).
    - `maxSteps?: number`: Optional limit on number of steps.
    - `allowEmptySteps?: boolean`: Permit empty step arrays (default: `false`).

- **Returns**: `PlanValidationResult`
  - `valid: boolean`
  - `totalCost: number`
  - `errors: string[]`
  - `details: PlanValidationErrorDetail[]`

### `assertValidPlanGraph(steps, budget, options?)`

Identical to `validatePlanGraph`, but throws a specialized `PlanValidationError` subclass when `result.valid === false`.

---

## Testing

Run the included unit test suite:

```bash
npm test
```

Build the distribution bundle:

```bash
npm run build
```

---

## License

MIT © Atlas Project Contributors
