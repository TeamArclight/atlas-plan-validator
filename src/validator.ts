import type {
  PlanStep,
  PlanValidationOptions,
  PlanValidationResult,
  PlanValidationErrorDetail,
} from './types.js';
import {
  PlanValidationError,
  BudgetExceededError,
  CyclicDependencyError,
  UnauthorizedToolError,
  MissingApprovalGateError,
  MalformedStepError,
} from './errors.js';

/**
 * Deterministic graph and constraint validator for multi-step AI agent mission plans.
 *
 * Enforces:
 * 1. Step structural integrity (unique non-empty ID, non-empty title)
 * 2. Tool authorization allowlists
 * 3. Cost-bound sanity (finite non-negative numbers)
 * 4. Human-in-the-loop approval gates for any action incurring financial impact
 * 5. Overall budget upper bounds with counterexample gaps
 * 6. Valid dependency references (no missing dependencies, no self-references)
 * 7. Directed Acyclic Graph (DAG) acyclicity verification via Kahn's topological sort
 */
export function validatePlanGraph(
  steps: PlanStep[],
  budget: number,
  options: PlanValidationOptions = {}
): PlanValidationResult {
  const errors: string[] = [];
  const details: PlanValidationErrorDetail[] = [];
  const currency = options.currency ?? 'INR';
  const requireApprovalForPaidSteps = options.requireApprovalForPaidSteps !== false;

  // 1. Array sanity check
  if (!Array.isArray(steps)) {
    const message = 'Plan steps must be provided as an array.';
    errors.push(message);
    details.push({ code: 'MALFORMED_STEP', message });
    return { valid: false, totalCost: 0, errors, details };
  }

  if (steps.length === 0 && !options.allowEmptySteps) {
    const message = 'Plan contains no steps; at least one step is required.';
    errors.push(message);
    details.push({ code: 'EMPTY_PLAN', message });
    return { valid: false, totalCost: 0, errors, details };
  }

  if (options.maxSteps !== undefined && steps.length > options.maxSteps) {
    const message = `Plan step count (${steps.length}) exceeds maximum permitted steps (${options.maxSteps}).`;
    errors.push(message);
    details.push({
      code: 'PLAN_TOO_LARGE',
      message,
      counterexample: { count: steps.length, max: options.maxSteps },
    });
  }

  // Normalize allowed tools
  let allowedToolsSet: Set<string> | null = null;
  if (options.allowedTools) {
    allowedToolsSet =
      options.allowedTools instanceof Set
        ? options.allowedTools
        : new Set(options.allowedTools);
  }

  const stepMap = new Map<string, PlanStep>();
  let totalCost = 0;

  // 2. Individual step validation
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (!step || typeof step !== 'object') {
      const message = `Step at index ${i} is not a valid object.`;
      errors.push(message);
      details.push({ code: 'MALFORMED_STEP', message });
      continue;
    }

    if (!step.id || typeof step.id !== 'string' || !step.id.trim()) {
      const message = `Each step must possess a unique non-empty string ID (failed at index ${i}).`;
      errors.push(message);
      details.push({ code: 'MALFORMED_STEP', message });
      continue;
    }

    if (!step.title || typeof step.title !== 'string' || !step.title.trim()) {
      const message = `Step "${step.id}" must possess a non-empty string title.`;
      errors.push(message);
      details.push({ code: 'MALFORMED_STEP', stepId: step.id, message });
    }

    if (stepMap.has(step.id)) {
      const message = `Duplicate step ID detected: "${step.id}".`;
      errors.push(message);
      details.push({ code: 'DUPLICATE_STEP_ID', stepId: step.id, message });
    }
    stepMap.set(step.id, step);

    if (allowedToolsSet !== null) {
      if (typeof step.tool !== 'string' || !allowedToolsSet.has(step.tool)) {
        const message = `Tool "${step.tool}" is not in the authorized tools allowlist.`;
        errors.push(message);
        details.push({
          code: 'UNAUTHORIZED_TOOL',
          stepId: step.id,
          message,
          counterexample: { tool: step.tool },
        });
      }
    }

    const bound = step.costBound ?? 0;
    if (typeof bound !== 'number' || bound < 0 || !Number.isFinite(bound)) {
      const message = `Step "${step.id}" costBound must be a non-negative finite number.`;
      errors.push(message);
      details.push({
        code: 'INVALID_COST',
        stepId: step.id,
        message,
        counterexample: { costBound: bound },
      });
    } else {
      totalCost += bound;
    }

    // Human-in-the-loop approval requirement for costly actions
    if (requireApprovalForPaidSteps && bound > 0 && step.requiresApproval !== true) {
      const formattedBound = bound.toLocaleString('en-IN');
      const message = `Step "${step.id}" incurs cost (${currency} ${formattedBound}) but does not require approval.`;
      errors.push(message);
      details.push({
        code: 'MISSING_APPROVAL_GATE',
        stepId: step.id,
        message,
        counterexample: { costBound: bound, requiresApproval: step.requiresApproval },
      });
    }
  }

  // 3. Budget upper-bound verification with counterexample gap
  const formattedBudget = Number(budget).toLocaleString('en-IN');
  const formattedTotal = totalCost.toLocaleString('en-IN');
  if (typeof budget !== 'number' || budget < 0 || !Number.isFinite(budget)) {
    const message = `Allocated budget must be a non-negative finite number.`;
    errors.push(message);
    details.push({ code: 'INVALID_COST', message, counterexample: { budget } });
  } else if (totalCost > budget) {
    const costGap = totalCost - budget;
    const formattedGap = costGap.toLocaleString('en-IN');
    const message = `Plan total cost (${currency} ${formattedTotal}) exceeds allocated budget (${currency} ${formattedBudget}). Counterexample: cost gap is ${currency} ${formattedGap}.`;
    errors.push(message);
    details.push({
      code: 'BUDGET_EXCEEDED',
      message,
      counterexample: {
        totalCost,
        budget,
        costGap,
        currency,
      },
    });
  }

  // 4. Acyclic dependency verification (Kahn's Topological Sorting algorithm)
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const id of stepMap.keys()) {
    inDegree.set(id, 0);
    graph.set(id, []);
  }

  for (const [id, step] of stepMap.entries()) {
    const deps = step.dependencies ?? [];
    if (!Array.isArray(deps)) {
      const message = `Step "${id}" dependencies must be an array of step IDs.`;
      errors.push(message);
      details.push({ code: 'MALFORMED_STEP', stepId: id, message });
      continue;
    }

    for (const dep of deps) {
      if (dep === id) {
        const message = `Step "${id}" cannot depend on itself.`;
        errors.push(message);
        details.push({ code: 'SELF_DEPENDENCY', stepId: id, message });
        continue;
      }
      if (!stepMap.has(dep)) {
        const message = `Step "${id}" depends on non-existent step "${dep}".`;
        errors.push(message);
        details.push({
          code: 'MISSING_DEPENDENCY',
          stepId: id,
          message,
          counterexample: { missingDependency: dep },
        });
        continue;
      }
      graph.get(dep)!.push(id);
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visitedCount++;
    for (const neighbor of graph.get(current) ?? []) {
      const nextDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) queue.push(neighbor);
    }
  }

  if (visitedCount !== stepMap.size) {
    const unvisited = Array.from(stepMap.keys()).filter(
      (id) => (inDegree.get(id) ?? 0) > 0
    );
    const message = 'Cyclic dependency detected in mission steps graph.';
    errors.push(message);
    details.push({
      code: 'CYCLIC_DEPENDENCY',
      message,
      counterexample: { cycleParticipants: unvisited },
    });
  }

  return {
    valid: errors.length === 0,
    totalCost,
    errors,
    details,
  };
}

/**
 * Asserts that a plan graph satisfies all safety and structural constraints.
 * Throws a specific `PlanValidationError` subclass if validation fails.
 */
export function assertValidPlanGraph(
  steps: PlanStep[],
  budget: number,
  options: PlanValidationOptions = {}
): PlanValidationResult {
  const result = validatePlanGraph(steps, budget, options);
  if (!result.valid) {
    const firstDetail = result.details[0];
    const message = result.errors.join('; ');

    if (firstDetail?.code === 'BUDGET_EXCEEDED') {
      throw new BudgetExceededError(message, firstDetail.counterexample);
    }
    if (firstDetail?.code === 'CYCLIC_DEPENDENCY') {
      throw new CyclicDependencyError(message);
    }
    if (firstDetail?.code === 'UNAUTHORIZED_TOOL') {
      throw new UnauthorizedToolError(message);
    }
    if (firstDetail?.code === 'MISSING_APPROVAL_GATE') {
      throw new MissingApprovalGateError(message);
    }
    if (firstDetail?.code === 'MALFORMED_STEP') {
      throw new MalformedStepError(message);
    }

    throw new PlanValidationError(message, {
      errors: result.errors,
      details: result.details,
      counterexample: firstDetail?.counterexample,
    });
  }
  return result;
}
