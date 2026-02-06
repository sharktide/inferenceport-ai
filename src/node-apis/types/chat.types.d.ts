export type Role = "user" | "assistant" | "tool" | "system" | "image";
export type AssetRole = "image";

export type ChatMessage = {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
};

export type ChatAsset = {
  role: AssetRole;
  content: string;
};

export type ModelInfo = {
  name: string;
  id: string;
  size: string;
  modified: string;
};

export type PullProgress = {
  model: string;
  output: string;
};

export type Message = ChatMessage;

export type SessionType = {
  name: string;
  model: string;
  favorite: boolean;
  history: ChatMessage[];
};

export type Session = SessionType;
export type Sessions = Record<string, Session>;

export type ChatHistoryEntry = {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_call_id?: string;
	tool_calls?: ToolCall[];
};

export type PullChunk = {
	status?: string;
	digest?: string;
	total?: number;
	completed?: number;
};

export type PullSection = {
	label: string;
	total?: number;
	completed?: number;
};
