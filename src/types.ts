/**
 * Represents a single planned step in an agent mission graph.
 */
export interface PlanStep {
  /** Unique non-empty identifier for this step */
  id: string;
  /** Human-readable title or description of this action */
  title: string;
  /** Name of the tool or action to execute (if any) */
  tool?: string;
  /** Key-value arguments passed to the tool */
  args?: Record<string, unknown>;
  /** Upper bound on financial or resource cost incurred by this step (default: 0) */
  costBound?: number;
  /** List of step IDs that must complete before this step can begin */
  dependencies?: string[];
  /** Whether explicit human approval is mandatory prior to executing this step */
  requiresApproval?: boolean;
  /** Current execution state */
  state?: string;
  /** Optional execution result */
  result?: unknown;
  /** Optional error message */
  error?: string;
}

/**
 * Configuration options for plan graph validation.
 */
export interface PlanValidationOptions {
  /**
   * Set or array of authorized tool names.
   * If provided, any step invoking an unlisted tool will be rejected.
   */
  allowedTools?: Set<string> | string[] | readonly string[];

  /**
   * Currency code or symbol used in error reporting (default: 'INR').
   */
  currency?: string;

  /**
   * Whether steps with positive costBound (> 0) must require explicit approval.
   * Default: true.
   */
  requireApprovalForPaidSteps?: boolean;

  /**
   * Maximum permitted steps in a single plan graph (optional safety cap).
   */
  maxSteps?: number;

  /**
   * Whether an empty plan (0 steps) is considered valid.
   * Default: false.
   */
  allowEmptySteps?: boolean;
}

/**
 * Detailed error descriptor for programmatic handling.
 */
export interface PlanValidationErrorDetail {
  code:
    | 'EMPTY_PLAN'
    | 'PLAN_TOO_LARGE'
    | 'MALFORMED_STEP'
    | 'DUPLICATE_STEP_ID'
    | 'UNAUTHORIZED_TOOL'
    | 'INVALID_COST'
    | 'MISSING_APPROVAL_GATE'
    | 'BUDGET_EXCEEDED'
    | 'MISSING_DEPENDENCY'
    | 'SELF_DEPENDENCY'
    | 'CYCLIC_DEPENDENCY';
  message: string;
  stepId?: string;
  counterexample?: Record<string, unknown>;
}

/**
 * Output of plan graph validation.
 */
export interface PlanValidationResult {
  /** True if the plan satisfies all graph, budget, allowlist, and policy constraints */
  valid: boolean;
  /** Total computed cost bound across all valid steps */
  totalCost: number;
  /** Human-readable list of validation error descriptions */
  errors: string[];
  /** Structured machine-readable error details */
  details: PlanValidationErrorDetail[];
}
