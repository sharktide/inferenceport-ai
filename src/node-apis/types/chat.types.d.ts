export type Role = "user" | "assistant" | "tool" | "system" | "image" | "video" | "audio";
export type AssetRole = "image" | "video" | "audio";

// OpenAI Chat Completions-style multimodal user content parts (vision input).
// We keep this minimal and JSON-serializable because it's persisted in sessions
// and passed over Electron IPC.
export type UserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type MessageContent = string | UserContentPart[];

export type ChatMessage = {
  role: Role;
  content: MessageContent;
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
	content: MessageContent;
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
