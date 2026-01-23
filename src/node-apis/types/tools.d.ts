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
