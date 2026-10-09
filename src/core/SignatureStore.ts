import type { ISafeTxDataParams } from '../types';

/**
 * Holds signatures produced by `TxType.TypedSignature` txs so later txs in the same
 * queue can consume them (e.g. create-and-execute reads the `safe/createSafe` signature).
 */
export class SignatureStore {
  private signatures = new Map<string, string>();

  private safeTxData?: ISafeTxDataParams;

  private key(protocol: string, actionName: string) {
    return `${protocol}:${actionName}`;
  }

  set(protocol: string, actionName: string, signature: string) {
    this.signatures.set(this.key(protocol, actionName), signature);
  }

  get(protocol: string, actionName: string): string | undefined {
    return this.signatures.get(this.key(protocol, actionName));
  }

  setSafeTxData(data: ISafeTxDataParams) {
    this.safeTxData = data;
  }

  getSafeTxData(): ISafeTxDataParams | undefined {
    return this.safeTxData;
  }

  clear() {
    this.signatures.clear();
    this.safeTxData = undefined;
  }
}
