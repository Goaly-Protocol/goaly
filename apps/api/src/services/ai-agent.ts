/**
 * LLM reasoning layer for the yield agent (OpenAI). The rule-based `decideRebalance` already targets
 * the highest risk-adjusted APY across chains and tokens; this asks a model to sanity-check that move
 * and produce a concrete, human rationale + confidence. Advisory only — execution stays rule-gated.
 */

export interface AiVault {
  name: string;
  apy: number;
  tvlUsd: number;
  chain: string;
  asset: string;
}

export interface AiRebalanceInput {
  current: AiVault | null;
  best: AiVault | null;
  shouldRebalance: boolean;
  gainBps: number;
  crossChain: boolean;
  candidates: AiVault[];
  fetchFn?: typeof fetch;
}

export interface AiRebalanceOutput {
  reason: string;
  confidence: number;
}

const SYSTEM = `You are Goaly's autonomous yield agent. Goaly is a no-loss football prediction pool on Arbitrum whose staked USDT0 is supplied to a Morpho vault; you keep it in the highest risk-adjusted APY vault, moving cross-token (USDT0↔USDC via Uniswap) and cross-chain (Wormhole Automatic CCTP) when worth it. Given the current vault, the best candidate anywhere, and the vault landscape, judge whether the proposed move is sound (favour real yield gains on deep, reputable vaults; avoid chasing thin TVL). Reply ONLY as compact JSON: {"reason":"<=260 chars, concrete, mentions the vaults/chains/APYs>","confidence":0-1}.`;

/** Ask OpenAI to narrate + score the rebalance decision. Returns null on any failure (never throws). */
export async function aiRebalanceRationale(
  apiKey: string,
  input: AiRebalanceInput,
): Promise<AiRebalanceOutput | null> {
  const doFetch = input.fetchFn ?? fetch;
  try {
    const res = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({
              current: input.current,
              best: input.best,
              shouldRebalance: input.shouldRebalance,
              gainBps: input.gainBps,
              crossChain: input.crossChain,
              topCandidates: input.candidates.slice(0, 8),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { reason?: unknown; confidence?: unknown };
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    if (!reason) return null;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    return { reason, confidence };
  } catch {
    return null;
  }
}
