import Anthropic from '@anthropic-ai/sdk';
import { calculateCost, type TokenUsage } from '../pricing.js';
import { logger } from '../../lib/logger.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Derive the stream type directly from the SDK — no internal path imports
type MessageStream = ReturnType<typeof client.messages.stream>;

// Active streams indexed by conversationId for abort support
const activeStreams = new Map<string, MessageStream>();

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Anthropic.MessageParam['content'];
}

export interface StreamParams {
  conversationId: string;
  assistantMessageId: string;
  model: string;
  systemPrompt: string | null;
  messages: AnthropicMessage[];
  onEvent: (event: string, data: unknown) => void;
}

export interface StreamResult {
  content: string;
  finishReason: string;
  usage: TokenUsage;
  costUsd: number;
}

export async function streamAnthropicMessage(params: StreamParams): Promise<StreamResult> {
  const { conversationId, model, systemPrompt, messages, onEvent } = params;

  const createParams: Anthropic.MessageStreamParams = {
    model,
    max_tokens: 8096,
    messages: messages as Anthropic.MessageParam[],
    ...(systemPrompt ? { system: systemPrompt } : {}),
  };

  let fullText = '';
  let finishReason = 'end_turn';

  const stream = client.messages.stream(createParams);
  activeStreams.set(conversationId, stream);

  try {
    stream.on('text', (textDelta: string) => {
      fullText += textDelta;
      onEvent('text_delta', { delta: textDelta });
    });

    const finalMessage = await stream.finalMessage();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawUsage = finalMessage.usage as any;
    const usage: TokenUsage = {
      inputTokens: rawUsage.input_tokens ?? 0,
      outputTokens: rawUsage.output_tokens ?? 0,
      cacheReadTokens: rawUsage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: rawUsage.cache_creation_input_tokens ?? 0,
    };
    finishReason = finalMessage.stop_reason ?? 'end_turn';

    const costUsd = calculateCost(model, usage);

    onEvent('usage', {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd,
    });

    return { content: fullText, finishReason, usage, costUsd };
  } catch (err: unknown) {
    // AbortError is expected on client abort — don't log as error
    if (err instanceof Error && err.name === 'AbortError') {
      logger.info({ conversationId }, 'stream aborted by client');
      onEvent('error', { code: 'ABORTED', message: 'Stream was aborted' });
      return {
        content: fullText,
        finishReason: 'aborted',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
      };
    }
    logger.error({ err, conversationId }, 'anthropic stream error');
    onEvent('error', { code: 'PROVIDER_ERROR', message: 'Stream failed' });
    throw err;
  } finally {
    activeStreams.delete(conversationId);
  }
}

export function abortStream(conversationId: string): boolean {
  const stream = activeStreams.get(conversationId);
  if (!stream) { return false; }
  stream.abort();
  activeStreams.delete(conversationId);
  return true;
}
