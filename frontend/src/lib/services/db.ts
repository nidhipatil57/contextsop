import { createClient } from "@/utils/supabase/client";
import { WorkflowDsl } from "../workflow";

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Sop {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  original_transcript_id: string | null;
  dsl_payload: WorkflowDsl;
  created_at: string;
  updated_at: string;
}

export interface SopVersion {
  id: string;
  sop_id: string;
  dsl_payload: WorkflowDsl;
  version_number: number;
  updated_by: string;
  created_at: string;
}

export interface SopExecution {
  id: string;
  sop_id: string;
  executed_by: string;
  organization_id: string;
  variable_state: Record<string, unknown>;
  completed_steps: string[];
  status: "running" | "completed" | "failed" | "aborted";
  created_at: string;
}

/**
 * Creates a new project under the specified organization.
 */
export async function createProject(
  organizationId: string,
  name: string,
  description?: string,
): Promise<Project> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      name,
      description,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Project;
}

/**
 * Retrieves all projects associated with the organization.
 */
export async function listProjects(
  organizationId: string,
  includeDeleted = false,
): Promise<Project[]> {
  const supabase = createClient();
  let query = supabase
    .from("projects")
    .select("*")
    .eq("organization_id", organizationId);

  if (!includeDeleted) {
    query = query.eq("deleted", false);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return data as Project[];
}

/**
 * Soft deletes a project by setting the deleted flag.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("projects")
    .update({ deleted: true })
    .eq("id", projectId);

  if (error) throw error;
}

/**
 * Transactionally inserts a new SOP and logs its version 1 entry.
 */
export async function createSop(
  organizationId: string,
  title: string,
  description: string | null,
  projectId: string | null,
  originalTranscriptId: string | null,
  dslPayload: WorkflowDsl,
  userId: string,
): Promise<Sop> {
  const supabase = createClient();

  // 1. Insert into sops
  const { data: sopData, error: sopError } = await supabase
    .from("sops")
    .insert({
      organization_id: organizationId,
      title,
      description,
      project_id: projectId,
      original_transcript_id: originalTranscriptId,
      dsl_payload: dslPayload as unknown as Record<string, unknown>,
    })
    .select()
    .single();

  if (sopError) throw sopError;

  // 2. Log version 1 in sop_versions
  const { error: versionError } = await supabase.from("sop_versions").insert({
    sop_id: sopData.id,
    dsl_payload: dslPayload as unknown as Record<string, unknown>,
    version_number: 1,
    updated_by: userId,
  });

  if (versionError) {
    // Clean up orphaned SOP to simulate roll back
    await supabase.from("sops").delete().eq("id", sopData.id);
    throw versionError;
  }

  return sopData as Sop;
}

/**
 * Retrieves an SOP by its identifier.
 */
export async function getSop(id: string): Promise<Sop> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sops")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Sop;
}

/**
 * Invokes the atomic postgres function to update an SOP and log a new version.
 */
export async function updateSop(
  sopId: string,
  dslPayload: WorkflowDsl,
  userId: string,
  expectedVersionNumber?: number,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_new_sop_version", {
    p_sop_id: sopId,
    p_dsl_payload: dslPayload as unknown as Record<string, unknown>,
    p_updated_by: userId,
    p_expected_version_number:
      expectedVersionNumber !== undefined ? expectedVersionNumber : null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Lists SOPs under the organization with optional filters (project_id or full-text query search).
 */
export async function listSops(
  organizationId: string,
  options?: {
    projectId?: string;
    searchQuery?: string;
    includeArchived?: boolean;
  },
): Promise<Sop[]> {
  const supabase = createClient();
  let query = supabase
    .from("sops")
    .select("*")
    .eq("organization_id", organizationId);

  if (!options?.includeArchived) {
    query = query.eq("archived", false);
  }

  if (options?.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  if (options?.searchQuery) {
    query = query.or(
      `title.ilike.%${options.searchQuery}%,description.ilike.%${options.searchQuery}%`,
    );
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) throw error;
  return data as Sop[];
}

/**
 * Soft deletes/archives an SOP.
 */
export async function archiveSop(
  sopId: string,
  archived: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sops")
    .update({ archived })
    .eq("id", sopId);

  if (error) throw error;
}

/**
 * Lists historical version edits of an SOP.
 */
export async function listSopVersions(sopId: string): Promise<SopVersion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sop_versions")
    .select("*")
    .eq("sop_id", sopId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return data as SopVersion[];
}

/**
 * Initializes a new runbook execution tracker.
 */
export async function createSopExecution(
  sopId: string,
  executedBy: string,
  organizationId: string,
  variableState: Record<string, unknown>,
): Promise<SopExecution> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sop_executions")
    .insert({
      sop_id: sopId,
      executed_by: executedBy,
      organization_id: organizationId,
      variable_state: variableState,
      status: "running",
    })
    .select()
    .single();

  if (error) throw error;
  return data as SopExecution;
}

/**
 * Saves live execution progress and updates status.
 */
export async function updateSopExecution(
  executionId: string,
  completedSteps: string[],
  status: "running" | "completed" | "failed" | "aborted",
  variableState?: Record<string, unknown>,
): Promise<SopExecution> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sop_executions")
    .update({
      completed_steps: completedSteps,
      status,
      ...(variableState && { variable_state: variableState }),
    })
    .eq("id", executionId)
    .select()
    .single();

  if (error) throw error;
  return data as SopExecution;
}

/**
 * Lists past executions for a specific SOP.
 */
export async function listSopExecutions(
  sopId: string,
): Promise<SopExecution[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sop_executions")
    .select("*")
    .eq("sop_id", sopId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as SopExecution[];
}
