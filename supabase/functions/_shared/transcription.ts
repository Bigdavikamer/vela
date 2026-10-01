import { FunctionError } from './http.ts';

/**
 * Audio transcription.
 *
 * Claude has no audio input, so this is the one part of the pipeline that needs
 * a second provider. The interface below is deliberately narrow so a different
 * provider (Deepgram, AssemblyAI, a self-hosted Whisper) can be dropped in
 * without touching the pipeline.
 *
 * If no provider is configured, this throws `provider_unconfigured` — the app
 * shows a clear message and keeps the audio. It never fabricates a transcript.
 */

export type TranscriptSegment = {
  index: number;
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
};

export type TranscriptionResult = {
  language: string | null;
  fullText: string;
  segments: TranscriptSegment[];
  provider: string;
  model: string;
};

export interface TranscriptionProvider {
  readonly name: string;
  readonly model: string;
  transcribe(audio: Blob, filename: string, languageHint?: string | null): Promise<TranscriptionResult>;
}

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

type WhisperVerboseResponse = {
  language?: string;
  text?: string;
  segments?: { id: number; start: number; end: number; text: string }[];
};

class OpenAITranscription implements TranscriptionProvider {
  readonly name = 'openai';
  readonly model: string;

  constructor(private readonly apiKey: string, model?: string) {
    // whisper-1 is the model that returns per-segment timestamps, which the
    // transcript viewer and "play from here" both depend on.
    this.model = model ?? 'whisper-1';
  }

  async transcribe(
    audio: Blob,
    filename: string,
    languageHint?: string | null,
  ): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append('file', audio, filename);
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (languageHint) form.append('language', languageHint);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new FunctionError(
          'provider_unconfigured',
          'Transcription is not configured correctly.',
          'The transcription API key was rejected.',
        );
      }
      if (response.status === 413) {
        throw new FunctionError(
          'too_large',
          'That recording is too long to transcribe in one piece.',
          detail.slice(0, 200),
        );
      }
      throw new FunctionError(
        'provider_failed',
        'Transcription failed. Your recording is safe — you can retry.',
        `status ${response.status}`,
      );
    }

    const data = (await response.json()) as WhisperVerboseResponse;
    const segments: TranscriptSegment[] = (data.segments ?? []).map((s, i) => ({
      index: i,
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      speaker: null,
      text: s.text.trim(),
    }));

    // If the provider returned no segments, keep the flat text rather than
    // losing the transcription entirely.
    const fullText = data.text?.trim() ?? segments.map((s) => s.text).join(' ');
    if (segments.length === 0 && fullText) {
      segments.push({ index: 0, startMs: 0, endMs: 0, speaker: null, text: fullText });
    }

    return {
      language: data.language ?? null,
      fullText,
      segments,
      provider: this.name,
      model: this.model,
    };
  }
}

/* -------------------------------------------------------------------------- */

export function getTranscriptionProvider(): TranscriptionProvider {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiKey) {
    return new OpenAITranscription(openaiKey, Deno.env.get('TRANSCRIPTION_MODEL') ?? undefined);
  }

  throw new FunctionError(
    'provider_unconfigured',
    'Audio transcription is not set up for this deployment.',
    'Set the OPENAI_API_KEY secret (used only for speech-to-text) on the Supabase project.',
  );
}

export function hasTranscriptionProvider(): boolean {
  return Boolean(Deno.env.get('OPENAI_API_KEY'));
}
