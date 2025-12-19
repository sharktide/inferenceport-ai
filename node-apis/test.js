const response = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama3.1:8b",
    stream: true,
    messages: [
      { role: "system", content: "Respond to the user." },
      { role: "user", content: "Search the web for a cookie recipe." },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "duckduckgo_search",
          description: "Search the web using DuckDuckGo",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
            },
            required: ["query"],
          },
        },
      },
    ],
  }),
});

if (!response.body) {
  throw new Error("No response body");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();

let buffer = "";
let fullMessage = "";
let toolCalls = [];

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  // Ollama streams JSON objects separated by newlines
  const lines = buffer.split("\n");
  buffer = lines.pop(); // keep incomplete line

  for (const line of lines) {
    if (!line.trim()) continue;

    const chunk = JSON.parse(line);

    // Assistant text tokens
    if (chunk.message?.content) {
      process.stdout.write(chunk.message.content);
      fullMessage += chunk.message.content;
    }

    // Tool calls (function calling)
    if (chunk.message?.tool_calls) {
      toolCalls.push(...chunk.message.tool_calls);
    }

    // End of response
    if (chunk.done) {
      console.log("\n\n--- DONE ---");
    }
  }
}

console.log("\n\nFinal assistant message:");
console.log(fullMessage);

console.log("\nTool calls:");
console.log(JSON.stringify(toolCalls, null, 2));
