// The Codex Responses wire protocol, as pi-ai speaks it
// (api/openai-codex-responses.js), reduced to the two pure transforms the AI
// SDK needs around it: the request body rewrite and the SSE event rename.
// No I/O here, so both are unit tested.

export const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const DEFAULT_INSTRUCTIONS = "You are a helpful assistant.";
const PROMPT_CACHE_KEY_MAX = 64;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageText(item: JsonObject): string {
  const content = item.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * Rewrites the body the AI SDK's OpenAI Responses model builds into what the
 * Codex endpoint accepts (PLAN 6.3): stateless (store false, no previous
 * response id, reasoning replayed inline as encrypted content), streaming,
 * the system prompt in `instructions`, no output token cap.
 *
 * Returns the rewritten body and the prompt cache key, which the caller also
 * sends as the session-id header.
 */
export function rewriteCodexRequestBody(body: JsonObject): {
  body: JsonObject;
  sessionId?: string;
  /** The caller asked for one JSON response (doGenerate); fold the stream back. */
  wantsJson: boolean;
} {
  const next: JsonObject = { ...body };
  const wantsJson = body.stream !== true;

  next.store = false;
  next.stream = true;

  const include = Array.isArray(next.include) ? next.include.filter((v): v is string => typeof v === "string") : [];
  if (!include.includes("reasoning.encrypted_content")) include.push("reasoning.encrypted_content");
  next.include = include;

  // Leading system/developer messages become `instructions`; the endpoint
  // rejects them inside `input`.
  const input = Array.isArray(next.input) ? [...next.input] : [];
  const instructions: string[] = typeof next.instructions === "string" && next.instructions ? [next.instructions] : [];
  while (input.length > 0) {
    const first = input[0];
    if (!isObject(first) || (first.role !== "system" && first.role !== "developer")) break;
    const text = messageText(first);
    if (text) instructions.push(text);
    input.shift();
  }
  next.input = input;
  next.instructions = instructions.length > 0 ? instructions.join("\n\n") : DEFAULT_INSTRUCTIONS;

  delete next.max_output_tokens;
  delete next.prompt_cache_retention;
  delete next.previous_response_id;

  const text = isObject(next.text) ? { ...next.text } : {};
  if (text.verbosity === undefined) text.verbosity = "low";
  next.text = text;

  if (isObject(next.reasoning)) {
    const reasoning = { ...next.reasoning };
    if (reasoning.summary === undefined) reasoning.summary = "auto";
    next.reasoning = reasoning;
  }

  if (Array.isArray(next.tools) && next.tools.length > 0) {
    if (next.tool_choice === undefined) next.tool_choice = "auto";
    if (next.parallel_tool_calls === undefined) next.parallel_tool_calls = true;
  }

  let sessionId: string | undefined;
  if (typeof next.prompt_cache_key === "string" && next.prompt_cache_key) {
    sessionId = Array.from(next.prompt_cache_key).slice(0, PROMPT_CACHE_KEY_MAX).join("");
    next.prompt_cache_key = sessionId;
  }

  return { body: next, sessionId, wantsJson };
}

/**
 * The endpoint only streams. For a non-streaming call (generateText) the
 * caller sends stream:true upstream and folds the SSE body back into the one
 * JSON response the AI SDK's doGenerate parser expects: the terminal event's
 * `response`, with `output` rebuilt from `response.output_item.done` events
 * when the terminal event leaves it empty (it does with store:false).
 *
 * @throws on an `error` or `response.failed` event, or a stream without a terminal event.
 */
export function collectResponseFromSse(sse: string): JsonObject {
  const items: unknown[] = [];
  let terminal: JsonObject | undefined;
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (!isObject(event)) continue;
    if (event.type === "error" || event.type === "response.failed") {
      const nested = isObject(event.response) && isObject(event.response.error) ? event.response.error : event;
      const message = typeof nested.message === "string" ? nested.message : JSON.stringify(event).slice(0, 300);
      throw new Error(`Model response failed: ${message}`);
    }
    if (event.type === "response.output_item.done" && isObject(event.item)) items.push(event.item);
    if (
      (event.type === "response.completed" || event.type === "response.done" || event.type === "response.incomplete") &&
      isObject(event.response)
    ) {
      terminal = event.response;
    }
  }
  if (!terminal) throw new Error("Model stream ended without a final response");
  const output = Array.isArray(terminal.output) && terminal.output.length > 0 ? terminal.output : items;
  return { ...terminal, output };
}

/**
 * SSE transform that renames a terminal `response.done` event to
 * `response.completed`, which is the only terminal name the AI SDK's chunk
 * schema accepts. `onRename` reports when it fired (the spike records whether
 * Codex still sends it).
 */
export function createResponseDoneRename(onRename?: () => void): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const rewriteLine = (line: string): string => {
    if (line === "event: response.done" || line === "event:response.done") {
      onRename?.();
      return "event: response.completed";
    }
    if (line.startsWith("data:") && line.includes('"response.done"')) {
      try {
        const json: unknown = JSON.parse(line.slice(5).trim());
        if (isObject(json) && json.type === "response.done") {
          onRename?.();
          return `data: ${JSON.stringify({ ...json, type: "response.completed" })}`;
        }
      } catch {
        return line;
      }
    }
    return line;
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (lines.length > 0) controller.enqueue(encoder.encode(lines.map(rewriteLine).join("\n") + "\n"));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(rewriteLine(buffer)));
    },
  });
}
