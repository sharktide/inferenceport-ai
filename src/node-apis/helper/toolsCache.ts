export type ToolsSupportCache = {
	cachedSupportsTools: string[] | null;
	cachedSupportsVision: string[] | null;
	writeInProgress: Promise<void> | null;
	visionWriteInProgress: Promise<void> | null;
};

export const cache: ToolsSupportCache = {
	cachedSupportsTools: null,
	cachedSupportsVision: null,
	writeInProgress: null,
	visionWriteInProgress: null,
};

