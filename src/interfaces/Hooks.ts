import type {
  EthereumAddress,
  EventData,
  ISafeTxDataParams,
  NetworkNumber,
  SafeWallet,
  SignatureType,
  TxReceipt,
} from '../types';
import type { EncodingReturnType } from '../types/encoding';
import type { TxConfirmData, TxSignConfirmData } from '../types/confirm';
import type TxWrapper from '../TxWrapper';

export type ApprovalPhase = 'request' | 'success' | 'failure';

export interface ApprovalEvent {
  phase: ApprovalPhase;
  asset: string;
  approveType: string;
  spender: EthereumAddress;
  isRevoke: boolean; // true for the approve(0) tx that precedes re-approval of USDT-like tokens
  error?: Error;
}

export interface SignatureEvent {
  protocol: string;
  actionName: string;
  signature: string;
  sigType: SignatureType;
}

/** Side-effect callbacks. All optional. Replaces the Redux dispatches the original implementation made. */
export interface TxHooks {
  onQueueStart?(txs: TxWrapper[]): void;
  onQueueProgress?(completed: number, total: number): void;
  onQueueEnd?(): void;
  onTxHash?(hash: string, tx: TxWrapper): void | Promise<void>;
  onTxMined?(hash: string, tx: TxWrapper): void;
  /** Fired before showing a confirm dialog. Useful for analytics. */
  onTxPrompt?(data: TxConfirmData | TxSignConfirmData, encoding: EncodingReturnType): void;
  onSignature?(event: SignatureEvent, tx: TxWrapper): void;
  onSafeTxData?(safeTx: ISafeTxDataParams, tx: TxWrapper): void;
  onApproval?(event: ApprovalEvent, tx: TxWrapper): void;
  onSmartWalletCreated?(wallet: SafeWallet, receipt: TxReceipt, options: { changeWallet: boolean }): void | Promise<void>;
  /** Called by create-and-execute flows when a different smart wallet must become active. */
  onSelectProxyWallet?(address: EthereumAddress): void | Promise<void>;
  /** Parse DFS swap / fee events out of a mined receipt. Defaults to no events. */
  parseReceiptEvents?(receipt: TxReceipt, tx: TxWrapper, network: NetworkNumber): Promise<EventData>;
  /** USD price for a token symbol. Enables the TxSaver minimum-sell check. */
  getAssetPriceUsd?(symbol: string, network: NetworkNumber): Promise<string>;
}
