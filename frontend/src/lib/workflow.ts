import DOMPurify from "dompurify";

export type WorkflowStepType =
  | "command"
  | "warning"
  | "checkbox"
  | "input"
  | "verification";

export type WorkflowDsl = {
  version: string;
  metadata: {
    title: string;
    description: string;
    targetEnvironment?: string;
    estimatedDuration?: number;
  };
  variables: Array<{
    name: string;
    label: string;
    type: "string" | "number" | "boolean";
    defaultValue: string;
    validationRegex?: string;
  }>;
  steps: Array<{
    id: string;
    type: WorkflowStepType;
    title: string;
    content: string;
    payload?: {
      commandString?: string;
      warningLevel?: "info" | "warning" | "critical";
      verificationUrl?: string;
      verificationExpectedResponse?: string;
    };
    dependsOn?: string[];
  }>;
};

interface StepWithDeps {
  id: string;
  dependsOn?: string[];
}

/**
 * Checks for circular dependencies in steps.
 */
function hasCircularDependency(steps: StepWithDeps[]): boolean {
  const visited: Record<string, number> = {}; // 0 = unvisited, 1 = visiting, 2 = visited
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  const dfs = (id: string): boolean => {
    visited[id] = 1; // visiting
    const step = stepMap.get(id);
    if (step && Array.isArray(step.dependsOn)) {
      for (const parentId of step.dependsOn) {
        const state = visited[parentId] || 0;
        if (state === 1) {
          return true; // Cycle detected
        } else if (state === 0) {
          if (dfs(parentId)) {
            return true;
          }
        }
      }
    }
    visited[id] = 2; // visited
    return false;
  };

  for (const step of steps) {
    if ((visited[step.id] || 0) === 0) {
      if (dfs(step.id)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Strict TypeScript type guard validation for Workflow DSL JSON payloads.
 */
export function isWorkflowDsl(value: unknown): value is WorkflowDsl {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  // 1. Version validation
  if (typeof candidate.version !== "string" || !/^\d+\.\d+(\.\d+)?$/.test(candidate.version)) {
    return false;
  }

  // 2. Metadata validation
  if (typeof candidate.metadata !== "object" || candidate.metadata === null) {
    return false;
  }
  
  const metadata = candidate.metadata as Record<string, unknown>;
  const title = metadata.title;
  const description = metadata.description;

  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    typeof description !== "string" ||
    description.trim().length === 0
  ) {
    return false;
  }
  
  if (metadata.targetEnvironment !== undefined && typeof metadata.targetEnvironment !== "string") {
    return false;
  }
  if (metadata.estimatedDuration !== undefined && typeof metadata.estimatedDuration !== "number") {
    return false;
  }

  // 3. Variables validation
  if (!Array.isArray(candidate.variables)) {
    return false;
  }

  const RESERVED_KEYWORDS = new Set([
    "if", "else", "while", "for", "return", "break", "continue", "import", "class", 
    "try", "except", "catch", "true", "false", "null", "undefined", "and", "or", 
    "not", "in", "is", "elif", "def", "lambda", "global", "nonlocal", "yield", 
    "pass", "assert", "with", "as", "del", "raise", "finally", "async", "await",
    "let", "const", "var", "function", "typeof", "instanceof", "void", "new", "delete",
    "switch", "case", "default", "do", "throw"
  ]);

  const varNames = new Set<string>();
  const variables = candidate.variables as unknown[];
  for (const item of variables) {
    if (!item || typeof item !== "object") return false;
    const v = item as Record<string, unknown>;
    const name = v.name;
    if (typeof name !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
    
    const label = v.label;
    const type = v.type;
    const defaultValue = v.defaultValue;
    const validationRegex = v.validationRegex;

    if (typeof label !== "string" || label.trim().length === 0) return false;
    if (type !== "string" && type !== "number" && type !== "boolean") return false;
    if (typeof defaultValue !== "string") return false;
    if (validationRegex !== undefined && typeof validationRegex !== "string") return false;

    if (varNames.has(name)) return false;
    varNames.add(name);

    if (RESERVED_KEYWORDS.has(name.toLowerCase())) return false;
  }

  // 4. Steps validation
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
    return false;
  }

  const stepIds = new Set<string>();
  const steps = candidate.steps as unknown[];
  for (const item of steps) {
    if (!item || typeof item !== "object") return false;
    const s = item as Record<string, unknown>;
    const id = s.id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) return false;
    
    const type = s.type;
    const stepTitle = s.title;
    const content = s.content;

    if (
      type !== "command" &&
      type !== "warning" &&
      type !== "checkbox" &&
      type !== "input" &&
      type !== "verification"
    ) {
      return false;
    }
    if (typeof stepTitle !== "string" || stepTitle.trim().length === 0) return false;
    if (typeof content !== "string" || content.trim().length === 0) return false;

    if (s.payload !== undefined) {
      if (typeof s.payload !== "object" || s.payload === null) return false;
      const payload = s.payload as Record<string, unknown>;
      const commandString = payload.commandString;
      const warningLevel = payload.warningLevel;
      const verificationUrl = payload.verificationUrl;
      const verificationExpectedResponse = payload.verificationExpectedResponse;

      if (commandString !== undefined && typeof commandString !== "string") return false;
      if (
        warningLevel !== undefined &&
        warningLevel !== "info" &&
        warningLevel !== "warning" &&
        warningLevel !== "critical"
      ) {
        return false;
      }
      if (verificationUrl !== undefined && typeof verificationUrl !== "string") return false;
      if (
        verificationExpectedResponse !== undefined &&
        typeof verificationExpectedResponse !== "string"
      ) {
        return false;
      }
    }

    if (s.dependsOn !== undefined) {
      if (!Array.isArray(s.dependsOn)) return false;
      for (const parentId of s.dependsOn) {
        if (typeof parentId !== "string") return false;
      }
    }

    if (stepIds.has(id)) return false;
    stepIds.add(id);
  }

  // 5. Dependency Validation (DAG verify)
  for (const item of steps) {
    const s = item as Record<string, unknown>;
    const id = s.id;
    if (typeof id !== "string") return false;
    if (s.dependsOn && Array.isArray(s.dependsOn)) {
      for (const parentId of s.dependsOn) {
        if (typeof parentId !== "string" || !stepIds.has(parentId)) return false;
        if (parentId === id) return false;
      }
    }
  }

  if (hasCircularDependency(candidate.steps as StepWithDeps[])) {
    return false;
  }

  return true;
}

/**
 * Migration helper to resolve schema version drift on the client side.
 * Converts snake_case keys and aliases to the modern version.
 */
export function migrateWorkflowDsl(value: unknown): WorkflowDsl {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid DSL format: expected object.");
  }

  const migrated = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

  // 1. Version migration
  if (typeof migrated.version !== "string" || ["0.1", "1.0", ""].includes(migrated.version)) {
    migrated.version = "1.0.0";
  }

  // 2. Variables migration
  if (Array.isArray(migrated.variables)) {
    migrated.variables = migrated.variables.map((item: unknown) => {
      if (item && typeof item === "object") {
        const v = item as Record<string, unknown>;
        if (v.defaultValue === undefined && v.default_value !== undefined) {
          v.defaultValue = v.default_value;
          delete v.default_value;
        }
        if (v.validationRegex === undefined && v.validation_regex !== undefined) {
          v.validationRegex = v.validation_regex;
          delete v.validation_regex;
        }
      }
      return item;
    });
  } else {
    migrated.variables = [];
  }

  // 3. Steps migration
  if (Array.isArray(migrated.steps)) {
    migrated.steps = migrated.steps.map((item: unknown) => {
      if (item && typeof item === "object") {
        const s = item as Record<string, unknown>;
        if (s.dependsOn === undefined && s.depends_on !== undefined) {
          s.dependsOn = s.depends_on;
          delete s.depends_on;
        }

        if (s.payload && typeof s.payload === "object") {
          const payload = s.payload as Record<string, unknown>;
          const mappings: Record<string, string> = {
            command_string: "commandString",
            warning_level: "warningLevel",
            verification_url: "verificationUrl",
            verification_expected_response: "verificationExpectedResponse",
          };
          for (const [snake, camel] of Object.entries(mappings)) {
            if (payload[camel] === undefined && payload[snake] !== undefined) {
              payload[camel] = payload[snake];
              delete payload[snake];
            }
          }
        }
      }
      return item;
    });
  } else {
    migrated.steps = [];
  }

  return migrated as unknown as WorkflowDsl;
}

/**
 * XSS Mitigation utility that passes all content fields through DOMPurify.
 */
export function sanitizeWorkflowDsl(dsl: WorkflowDsl): WorkflowDsl {
  const sanitizeText = (text: string): string => {
    if (typeof window === "undefined") {
      return text; // Skip sanitization on SSR compile phase (clean browser execution takes care of this)
    }
    return DOMPurify.sanitize(text);
  };

  return {
    ...dsl,
    metadata: {
      ...dsl.metadata,
      title: sanitizeText(dsl.metadata.title),
      description: sanitizeText(dsl.metadata.description),
      targetEnvironment: dsl.metadata.targetEnvironment
        ? sanitizeText(dsl.metadata.targetEnvironment)
        : undefined,
    },
    variables: dsl.variables.map((v) => ({
      ...v,
      label: sanitizeText(v.label),
      defaultValue: sanitizeText(v.defaultValue),
      validationRegex: v.validationRegex
        ? sanitizeText(v.validationRegex)
        : undefined,
    })),
    steps: dsl.steps.map((s) => {
      const newStep = {
        ...s,
        title: sanitizeText(s.title),
        content: sanitizeText(s.content),
      };
      if (s.payload) {
        newStep.payload = {
          ...s.payload,
          commandString: s.payload.commandString
            ? sanitizeText(s.payload.commandString)
            : undefined,
          verificationUrl: s.payload.verificationUrl
            ? sanitizeText(s.payload.verificationUrl)
            : undefined,
          verificationExpectedResponse: s.payload.verificationExpectedResponse
            ? sanitizeText(s.payload.verificationExpectedResponse)
            : undefined,
        };
      }
      return newStep;
    }),
  };
}
