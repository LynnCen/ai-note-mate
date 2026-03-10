import type { ChatMessage, ToolDefinition } from "@server/llm/types";

export type { ChatMessage, ToolDefinition };

export interface AgentContext {
  noteId: string | null;
  noteContent: string | null;
  noteTitle: string | null;
  /** Provider override from the client (e.g. \"openai\" / \"deepseek\" / \"gml\") */
  providerOverride?: string;
  /** Agent mode: \"agent\" (tool-calling) or \"ask\" (纯问答，不调工具). Defaults to \"agent\". */
  mode?: "agent" | "ask";
}
