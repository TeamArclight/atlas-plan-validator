import type { PlanValidationErrorDetail } from './types.js';

/**
 * Base exception thrown when plan validation fails.
 */
export class PlanValidationError extends Error {
  public readonly errors: string[];
  public readonly details: PlanValidationErrorDetail[];
  public readonly counterexample?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      errors?: string[];
      details?: PlanValidationErrorDetail[];
      counterexample?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = 'PlanValidationError';
    this.errors = options.errors ?? [message];
    this.details = options.details ?? [];
    this.counterexample = options.counterexample;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BudgetExceededError extends PlanValidationError {
  constructor(message: string, counterexample?: Record<string, unknown>) {
    super(message, { counterexample });
    this.name = 'BudgetExceededError';
  }
}

export class CyclicDependencyError extends PlanValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'CyclicDependencyError';
  }
}

export class UnauthorizedToolError extends PlanValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedToolError';
  }
}

export class MissingApprovalGateError extends PlanValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'MissingApprovalGateError';
  }
}

export class MalformedStepError extends PlanValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedStepError';
  }
}
