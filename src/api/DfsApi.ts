import type {
  EthereumAddress,
  MultisigSignatureForDb,
  MultisigTxForDb,
  NetworkNumber,
  TxSaverStatusCheckApiReturnData,
  TxSaverSubmitApiData,
} from '../types';

export interface DfsApiOptions {
  apiUrl: string; // e.g. https://app.defisaver.com
  safeApiUrl?: string; // Safe multisig service base URL. Defaults to `apiUrl`.
  timeoutMs?: number;
  fetch?: typeof fetch; // Override to add auth headers or for tests.
}

const withParams = (url: string, params: Record<string, string | number | undefined>) => {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return query ? `${url}?${query}` : url;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** DeFi Saver backend: Safe multisig persistence, TxSaver relayer and revert-reason lookup. */
export class DfsApi {
  private apiUrl: string;

  private safeApiUrl: string;

  private timeoutMs: number;

  private fetch: typeof fetch;

  constructor(options: DfsApiOptions) {
    if (!options?.apiUrl) throw new Error('DfsApi: apiUrl is required');
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.safeApiUrl = (options.safeApiUrl || options.apiUrl).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetch = options.fetch || ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  private signal() {
    return AbortSignal.timeout(this.timeoutMs);
  }

  private post(url: string, body: unknown) {
    return this.fetch(url, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body), signal: this.signal(),
    });
  }

  async getNextSafeNonce(address: EthereumAddress, safeAddress: EthereumAddress, network: NetworkNumber, forkId?: string): Promise<number> {
    const res = await this.fetch(withParams(`${this.safeApiUrl}/safe/nonce`, {
      address, safeAddress, network: +network, forkId,
    }), { signal: this.signal() });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error?.message || 'Failed to fetch Safe nonce');
    return body.data;
  }

  async postSafeTx(tx: MultisigTxForDb, forkId?: string): Promise<unknown> {
    const res = await this.post(`${this.safeApiUrl}/safe/tx`, { ...tx, forkId });
    const body = await res.json();
    if (!res.ok) throw new Error(`Failed to save transaction: ${body?.error?.message}`);
    return body;
  }

  async postSafeSignature(signature: MultisigSignatureForDb, forkId?: string): Promise<unknown> {
    const res = await this.post(`${this.safeApiUrl}/safe/signature`, { ...signature, forkId });
    const body = await res.json();
    if (!res.ok) throw new Error(`Failed to save signature: ${body?.error?.message}`);
    return body;
  }

  async cancelPendingTx(tx: MultisigTxForDb, txId: number, forkId?: string): Promise<unknown> {
    const res = await this.post(`${this.safeApiUrl}/safe/tx/cancel`, { tx: { ...tx, forkId }, txId });
    return res.json();
  }

  async submitTxToTxSaver(network: NetworkNumber, txSaverTxData: TxSaverSubmitApiData): Promise<number> {
    const res = await this.post(`${this.apiUrl}/api/txsaver/submit`, { network, txSaverTxData });
    if (!res.ok) throw new Error('Error while submitting transaction to txSaver');
    const body = await res.json();
    return body.txId;
  }

  async getTxSaverTxStatus(txId: number, network: NetworkNumber): Promise<TxSaverStatusCheckApiReturnData> {
    const res = await this.fetch(withParams(`${this.apiUrl}/api/txsaver/status`, { txId, network }), { signal: this.signal() });
    return res.json();
  }

  /** Revert reason shown in the failed notification. */
  async getTxErrorData(txHash: string): Promise<unknown> {
    const res = await this.fetch(`${this.apiUrl}/api/tx-error/${txHash}`, { signal: this.signal() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
}
