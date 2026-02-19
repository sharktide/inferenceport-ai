type ToolParametersSchema = {
	type: "object";
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

export type ToolDefinition = {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: ToolParametersSchema;
	};
};

export type ToolCallFunction = {
  name: string;
  arguments: string | Record<string, unknown>;
};

export type ToolCall = {
  function: ToolCallFunction;
};

export interface ToolList { 
	search: boolean;
	imageGen: boolean;
	videoGen: boolean;
	audioGen: boolean;
}