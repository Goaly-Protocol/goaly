/**
 * LayerZero Value Transfer API integration for the cross-chain yield agent.
 *
 * The VT API is LayerZero's hosted router (OFT / Stargate / CCTP / Aori) for moving value across
 * chains — no custom bridge contracts or pathway wiring required, source-chain gas only. We use it
 * two ways: {@link validateBridgeRoute} confirms a token path is live against the public token graph
 * (no key), and {@link quoteBridge} fetches an executable quote (needs a VT API key).
 */

const VT_API = 'https://transfer.layerzero-api.com/v1';

/** Confirm USDT0(src) → asset(dst) is a live LayerZero route. Public endpoint, no key. */
export async function validateBridgeRoute(
  params: { srcChainKey: string; srcToken: string; dstChainKey: string; dstToken: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<boolean> {
  const fetchFn = opts.fetchFn ?? fetch;
  try {
    const url =
      `${VT_API}/tokens?transferrableFromChainKey=${params.srcChainKey}` +
      `&transferrableFromTokenAddress=${params.srcToken}`;
    const res = await fetchFn(url);
    if (!res.ok) return false;
    const json = (await res.json()) as { tokens?: Array<{ chainKey?: string; address?: string }> };
    const dst = params.dstToken.toLowerCase();
    return (json.tokens ?? []).some(
      (t) => t.chainKey === params.dstChainKey && (t.address ?? '').toLowerCase() === dst,
    );
  } catch {
    return false;
  }
}

export interface BridgeQuote {
  /** Route protocol chosen by LayerZero (OFT, STARGATE_V2_TAXI, CCTP, AORI, …). */
  route: string;
  /** Estimated amount received on the destination (in the dst token's smallest unit). */
  dstAmount: string;
  /** Signed, ready-to-submit user steps (approve + bridge). */
  steps: unknown[];
}

/**
 * Fetch an executable cross-chain quote. Requires a LayerZero VT API key; returns null without one
 * or on any error. The returned `steps` are the transactions the agent wallet submits to bridge.
 */
export async function quoteBridge(
  params: {
    srcChainKey: string;
    dstChainKey: string;
    srcToken: string;
    dstToken: string;
    srcAmount: string;
    srcAddress: string;
    dstAddress: string;
    apiKey: string;
  },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<BridgeQuote | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  try {
    const res = await fetchFn(`${VT_API}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': params.apiKey },
      body: JSON.stringify({
        srcChainKey: params.srcChainKey,
        dstChainKey: params.dstChainKey,
        srcTokenAddress: params.srcToken,
        dstTokenAddress: params.dstToken,
        srcAmount: params.srcAmount,
        srcAddress: params.srcAddress,
        dstAddress: params.dstAddress,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: Array<{ route?: string; type?: string; dstAmount?: string; steps?: unknown[] }>;
    };
    const best = json.routes?.[0];
    if (!best) return null;
    return {
      route: best.route ?? best.type ?? 'OFT',
      dstAmount: best.dstAmount ?? '0',
      steps: best.steps ?? [],
    };
  } catch {
    return null;
  }
}
