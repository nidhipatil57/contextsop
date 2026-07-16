from enum import Enum
from pydantic import BaseModel, Field, field_validator


class VariableType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"


class StepType(str, Enum):
    COMMAND = "command"
    WARNING = "warning"
    CHECKBOX = "checkbox"
    INPUT = "input"
    VERIFICATION = "verification"


class WarningLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class WorkflowVariable(BaseModel):
    name: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$")
    label: str = Field(min_length=1, max_length=120)
    type: VariableType
    default_value: str = Field(alias="defaultValue", max_length=500)
    validation_regex: str | None = Field(default=None, alias="validationRegex")

    @field_validator("name")
    @classmethod
    def validate_variable_name(cls, name: str) -> str:
        reserved_keywords = {
            "if", "else", "while", "for", "return", "break", "continue", "import", "class", 
            "try", "except", "catch", "true", "false", "null", "undefined", "and", "or", 
            "not", "in", "is", "elif", "def", "lambda", "global", "nonlocal", "yield", 
            "pass", "assert", "with", "as", "del", "raise", "finally", "async", "await",
            "let", "const", "var", "function", "typeof", "instanceof", "void", "new", "delete",
            "switch", "case", "default", "do", "throw"
        }
        if name.lower() in reserved_keywords:
            raise ValueError(f"Variable name '{name}' conflicts with a reserved keyword.")
        return name


class WorkflowMetadata(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1, max_length=2_000)
    target_environment: str | None = Field(default=None, alias="targetEnvironment")
    estimated_duration: int | None = Field(default=None, alias="estimatedDuration", ge=1, le=1_440)


class WorkflowStepPayload(BaseModel):
    command_string: str | None = Field(default=None, alias="commandString", max_length=10_000)
    warning_level: WarningLevel | None = Field(default=None, alias="warningLevel")
    verification_url: str | None = Field(default=None, alias="verificationUrl", max_length=2_083)
    verification_expected_response: str | None = Field(default=None, alias="verificationExpectedResponse", max_length=10_000)


class WorkflowStep(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]+$")
    type: StepType
    title: str = Field(min_length=1, max_length=180)
    content: str = Field(min_length=1, max_length=10_000)
    payload: WorkflowStepPayload | None = None
    depends_on: list[str] | None = Field(default=None, alias="dependsOn")


class WorkflowDsl(BaseModel):
    version: str = Field(pattern=r"^\d+\.\d+(\.\d+)?$")
    metadata: WorkflowMetadata
    variables: list[WorkflowVariable] = Field(max_length=50)
    steps: list[WorkflowStep] = Field(min_length=1, max_length=500)

    @field_validator("variables")
    @classmethod
    def variable_names_are_unique(cls, variables: list[WorkflowVariable]) -> list[WorkflowVariable]:
        names = [variable.name for variable in variables]
        if len(names) != len(set(names)):
            raise ValueError("Variable names must be unique.")
        return variables

    @field_validator("steps")
    @classmethod
    def validate_step_dependencies(cls, steps: list[WorkflowStep]) -> list[WorkflowStep]:
        step_ids = {step.id for step in steps}
        
        # 1. Verify all depends_on IDs exist and do not self-reference
        for step in steps:
            if step.depends_on:
                for parent_id in step.depends_on:
                    if parent_id not in step_ids:
                        raise ValueError(f"Step '{step.id}' depends on non-existent step '{parent_id}'.")
                    if parent_id == step.id:
                        raise ValueError(f"Step '{step.id}' cannot depend on itself.")
        
        # 2. Check for circular dependencies using DFS
        visited = {}
        
        def has_cycle(node_id: str) -> bool:
            visited[node_id] = 1  # visiting
            step = next(s for s in steps if s.id == node_id)
            if step.depends_on:
                for parent_id in step.depends_on:
                    state = visited.get(parent_id, 0)
                    if state == 1:
                        return True  # Cycle detected
                    elif state == 0:
                        if has_cycle(parent_id):
                            return True
            visited[node_id] = 2  # visited
            return False

        for step in steps:
            if visited.get(step.id, 0) == 0:
                if has_cycle(step.id):
                    raise ValueError("Circular dependency detected in workflow steps.")
                    
        return steps


def migrate_sop_dsl(data: dict) -> dict:
    """
    Migration utility that upgrades legacy SOP format payloads to the latest schema format (1.0.0).
    Normalizes alias keys and values.
    """
    if not isinstance(data, dict):
        return data

    migrated = dict(data)
    
    # 1. Schema version migration
    if "version" not in migrated or migrated["version"] in (None, "", "0.1", "1.0"):
        migrated["version"] = "1.0.0"

    # 2. Variables migration
    if "variables" in migrated and isinstance(migrated["variables"], list):
        new_variables = []
        for var in migrated["variables"]:
            if isinstance(var, dict):
                new_var = dict(var)
                if "defaultValue" not in new_var and "default_value" in new_var:
                    new_var["defaultValue"] = new_var.pop("default_value")
                if "validationRegex" not in new_var and "validation_regex" in new_var:
                    new_var["validationRegex"] = new_var.pop("validation_regex")
                new_variables.append(new_var)
            else:
                new_variables.append(var)
        migrated["variables"] = new_variables

    # 3. Steps migration
    if "steps" in migrated and isinstance(migrated["steps"], list):
        new_steps = []
        for step in migrated["steps"]:
            if isinstance(step, dict):
                new_step = dict(step)
                if "dependsOn" not in new_step and "depends_on" in new_step:
                    new_step["dependsOn"] = new_step.pop("depends_on")
                
                # Payload migration
                if "payload" in new_step and isinstance(new_step["payload"], dict):
                    new_payload = dict(new_step["payload"])
                    mappings = {
                        "command_string": "commandString",
                        "warning_level": "warningLevel",
                        "verification_url": "verificationUrl",
                        "verification_expected_response": "verificationExpectedResponse"
                    }
                    for snake, camel in mappings.items():
                        if camel not in new_payload and snake in new_payload:
                            new_payload[camel] = new_payload.pop(snake)
                    new_step["payload"] = new_payload
                new_steps.append(new_step)
            else:
                new_steps.append(step)
        migrated["steps"] = new_steps

    return migrated
