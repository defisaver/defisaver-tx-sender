import type { ResolvedTxSenderConfig } from '../config/TxSenderConfig';
import { requireAddress } from '../services/utils';
import {
  type AdditionalInfoData, type EthereumAddress, type Hex, type ShowMevInfoData, type TxReceipt, TxType, type TxWParam,
} from '../types';
import TxWrapper from '../TxWrapper';

export interface RawTxParams {
  to: EthereumAddress;
  data: Hex;
  value?: string; // wei, default '0'
  title: string;
  protocol?: string;
  category?: string;
  additionalInfo?: AdditionalInfoData;
  /** Account (default) sends directly; a Safe address relays it as a plain CALL. */
  executingAddress?: TxWParam<EthereumAddress>;
  minGas?: number;
  extraGas?: number;
  addSuffix?: boolean;
  showMevInfo?: ShowMevInfoData;
  onExecuteBegin?: () => unknown | Promise<unknown>;
  onExecuteSuccess?: (receipt: TxReceipt) => unknown | Promise<unknown>;
  onExecuteError?: (error: Error) => unknown | Promise<unknown>;
  onTxHashCallback?: (txHash: string) => void;
}

/** Queues calldata that was encoded elsewhere (another SDK, a backend, a quote API). */
export default class RawTxHandler {
  constructor(private config: ResolvedTxSenderConfig, private txs: TxWrapper[]) {}

  handleRawTx(params: RawTxParams): TxWrapper {
    const {
      to, data, value = '0', executingAddress, ...rest
    } = params;
    requireAddress(to);
    if (!/^0x[0-9a-fA-F]*$/.test(data) || data.length < 4) throw new Error('RawTxHandler: data must be non-empty hex calldata');

    const tx = new TxWrapper(TxType.Raw, {
      ...rest,
      executingAddress: executingAddress || this.config.state.getAccount(),
      ethValue: value,
      rawTxCallParams: { from: this.config.state.getAccount(), to, data },
    });
    this.txs.push(tx);
    return tx;
  }
}
