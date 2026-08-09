/**
 * Minimal ChatGPT (OpenAI Chat Completions) client.
 *
 * Configure with `OPENAI_API_KEY` in `.env`; `OPENAI_MODEL` and `OPENAI_BASE_URL` are optional.
 * Every caller must handle the not-configured case so the app stays fully usable without a key.
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 45_000;

export class OpenAiNotConfiguredError extends Error {
  constructor() {
    super("The ChatGPT API key is not configured. Add OPENAI_API_KEY to your environment to enable AI insights.");
    this.name = "OpenAiNotConfiguredError";
  }
}

export class OpenAiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAiRequestError";
    this.status = status;
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function openAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

type ChatCompletionArgs = {
  system: string;
  user: string;
  /** Lower values keep numeric commentary conservative. */
  temperature?: number;
  maxTokens?: number;
};

export async function chatComplete({
  system,
  user,
  temperature = 0.2,
  maxTokens = 900,
}: ChatCompletionArgs): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAiNotConfiguredError();

  const baseUrl = process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "") || DEFAULT_BASE_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: openAiModel(),
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      let message = `ChatGPT request failed (${response.status}).`;
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Non-JSON error body; keep the generic message.
      }
      throw new OpenAiRequestError(message, response.status);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new OpenAiRequestError("ChatGPT returned an empty response.", 502);
    return content;
  } catch (error) {
    if (error instanceof OpenAiNotConfiguredError || error instanceof OpenAiRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAiRequestError("ChatGPT took too long to respond. Try a shorter date range.", 504);
    }
    throw new OpenAiRequestError("Could not reach the ChatGPT API.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
