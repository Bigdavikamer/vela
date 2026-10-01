import Anthropic from 'npm:@anthropic-ai/sdk@^0.122.0';

import { FunctionError } from './http.ts';

/**
 * The one place Vela talks to Claude.
 *
 * Nothing else in the codebase constructs a client or names a model, so model
 * choice, effort, and failure handling are a single decision rather than
 * fifteen scattered ones.
 */

export const MODEL = 'claude-opus-5';

/** Cheap, high-volume calls (grading one short answer, naming a thread). */
export const MODEL_FAST = 'claude-haiku-4-5';

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    // Explicit and honest: the pipeline is not configured, rather than
    // silently returning invented study material.
    throw new FunctionError(
      'provider_unconfigured',
      'AI is not configured for this deployment.',
      'Set the ANTHROPIC_API_KEY secret on the Supabase project.',
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type GenerateOptions = {
  system: string;
  messages: Anthropic.MessageParam[];
  /** JSON Schema the response must satisfy. Must set additionalProperties:false. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
  model?: string;
  /** adaptive thinking; off for simple extraction where it only adds latency */
  think?: boolean;
};

/**
 * Generates a JSON object that conforms to `schema`.
 *
 * Uses `output_config.format`, which guarantees the first content block is text
 * containing valid JSON matching the schema -- so the app never has to salvage
 * JSON out of prose, and a malformed model response cannot reach the database.
 */
export async function generateJson<T>(options: GenerateOptions): Promise<T> {
  const {
    system,
    messages,
    schema,
    maxTokens = 16000,
    effort = 'high',
    model = MODEL,
    think = true,
  } = options;

  const client = anthropic();

  try {
    const request = {
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(think ? { thinking: { type: 'adaptive' as const } } : {}),
      output_config: {
        effort,
        format: { type: 'json_schema' as const, schema },
      },
    };

    // Large generations must stream, or the request outlives the HTTP timeout
    // before the model is finished.
    const response =
      maxTokens > 16000
        ? await client.messages.stream(request).finalMessage()
        : await client.messages.create(request);

    if (response.stop_reason === 'refusal') {
      throw new FunctionError(
        'provider_failed',
        'Vela could not process this material.',
        response.stop_details?.explanation ?? 'refusal',
      );
    }

    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )?.text;

    if (!text) {
      throw new FunctionError('provider_failed', 'The AI returned an empty response.');
    }

    return JSON.parse(text) as T;
  } catch (error) {
    throw mapAnthropicError(error);
  }
}

/** Plain-text generation, used by the tutor where the reply is prose. */
export async function generateText(options: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  effort?: Effort;
  model?: string;
  think?: boolean;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const {
    system,
    messages,
    maxTokens = 8000,
    effort = 'high',
    model = MODEL,
    think = true,
  } = options;

  try {
    const response = await anthropic().messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(think ? { thinking: { type: 'adaptive' as const } } : {}),
      output_config: { effort },
    });

    if (response.stop_reason === 'refusal') {
      throw new FunctionError(
        'provider_failed',
        'Vela declined to answer that.',
        response.stop_details?.explanation ?? 'refusal',
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    throw mapAnthropicError(error);
  }
}

function mapAnthropicError(error: unknown): FunctionError {
  if (error instanceof FunctionError) return error;

  if (error instanceof Anthropic.RateLimitError) {
    return new FunctionError('provider_failed', 'Vela is briefly at capacity. Try again shortly.');
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new FunctionError(
      'provider_unconfigured',
      'AI is not configured correctly for this deployment.',
      'The ANTHROPIC_API_KEY secret was rejected.',
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new FunctionError('timeout', 'The AI service took too long to respond.');
  }
  if (error instanceof Anthropic.APIError) {
    return new FunctionError(
      'provider_failed',
      'Vela could not reach its AI service.',
      `status ${error.status}`,
    );
  }
  if (error instanceof SyntaxError) {
    return new FunctionError('provider_failed', 'The AI returned a malformed response.');
  }
  return new FunctionError('internal', 'Something broke while generating study material.');
}

/* -------------------------------------------------------------------------- */
/* Content blocks                                                             */
/* -------------------------------------------------------------------------- */

/** A PDF, sent to Claude natively so layout, tables, and figures survive. */
export function pdfBlock(base64: string): Anthropic.DocumentBlockParam {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64 },
  };
}

export function imageBlock(
  base64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

export function textBlock(text: string): Anthropic.TextBlockParam {
  return { type: 'text', text };
}
