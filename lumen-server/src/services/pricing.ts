/**
 * Compute cost in USD for a Claude API call.
 * Prices come from env to allow live override without redeploy.
 */

const price = (key: string, fallback: number): number => {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function pricingFor(model: string): ModelPricing {
  if (model.startsWith('claude-opus')) {
    return {
      input: price('PRICE_OPUS_INPUT', 15.0),
      output: price('PRICE_OPUS_OUTPUT', 75.0),
      cacheRead: price('PRICE_OPUS_CACHE_READ', 1.5),
      cacheWrite: price('PRICE_OPUS_CACHE_WRITE', 18.75),
    };
  }
  if (model.startsWith('claude-haiku')) {
    return {
      input: price('PRICE_HAIKU_INPUT', 1.0),
      output: price('PRICE_HAIKU_OUTPUT', 5.0),
      cacheRead: price('PRICE_HAIKU_CACHE_READ', 0.1),
      cacheWrite: price('PRICE_HAIKU_CACHE_WRITE', 1.25),
    };
  }
  // default: sonnet
  return {
    input: price('PRICE_SONNET_INPUT', 3.0),
    output: price('PRICE_SONNET_OUTPUT', 15.0),
    cacheRead: price('PRICE_SONNET_CACHE_READ', 0.3),
    cacheWrite: price('PRICE_SONNET_CACHE_WRITE', 3.75),
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function calculateCost(model: string, usage: TokenUsage): number {
  const p = pricingFor(model);
  const cost =
    (usage.inputTokens * p.input) / 1_000_000 +
    (usage.outputTokens * p.output) / 1_000_000 +
    (usage.cacheReadTokens * p.cacheRead) / 1_000_000 +
    (usage.cacheWriteTokens * p.cacheWrite) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6dp
}
