import type {
  EthereumAddress,
  EventData,
  ISafeTxDataParams,
  NetworkNumber,
  SafeWallet,
  SignatureType,
  TxMonitorRegistration,
  TxReceipt,
} from '../types';
import type { EncodingReturnType } from '../types/encoding';
import type { TxConfirmData, TxSignConfirmData } from '../types/confirm';
import type TxWrapper from '../TxWrapper';

export type HookPhase = 'request' | 'success' | 'failure';

export type ApprovalPhase = HookPhase;

export type ApprovalKind = 'erc20' | 'erc721' | 'debtDelegation';

export interface ApprovalEvent {
  phase: ApprovalPhase;
  kind: ApprovalKind;
  asset: string; // Display label: token symbol, or `NFT#<tokenId>` for ERC-721.
  assetAddress: EthereumAddress;
  tokenId?: string; // ERC-721 only.
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

/** `create` is `SafeProxyFactory.createProxyWithNonce`; `createAndExecute` is `DFSSafeFactory.createSafeAndExecute`. */
export type SmartWalletCreationOrigin = 'create' | 'createAndExecute';

export interface SmartWalletCreationEvent {
  phase: HookPhase;
  origin: SmartWalletCreationOrigin;
  changeWallet: boolean; // Whether the new Safe should become the active smart wallet.
  wallet?: SafeWallet; // success only
  receipt?: TxReceipt; // success only
  error?: Error; // failure only
}

/** Side-effect callbacks. All optional. Replaces the Redux dispatches the original implementation made. */
export interface TxHooks {
  onQueueStart?(txs: TxWrapper[]): void;
  onQueueProgress?(completed: number, total: number): void;
  onQueueEnd?(): void;
  /** The SDK has already registered the tx with the backend monitor; `registration` is the payload it sent. */
  onTxHash?(hash: string, tx: TxWrapper, registration: TxMonitorRegistration): void | Promise<void>;
  onTxMined?(hash: string, tx: TxWrapper): void;
  /** Fired before showing a confirm dialog. Useful for analytics. */
  onTxPrompt?(data: TxConfirmData | TxSignConfirmData, encoding: EncodingReturnType): void;
  onSignature?(event: SignatureEvent, tx: TxWrapper): void;
  onSafeTxData?(safeTx: ISafeTxDataParams, tx: TxWrapper): void;
  onApproval?(event: ApprovalEvent, tx: TxWrapper): void;
  onSmartWalletCreation?(event: SmartWalletCreationEvent, tx: TxWrapper): void | Promise<void>;
  /** Called by create-and-execute flows when a different smart wallet must become active. */
  onSelectProxyWallet?(address: EthereumAddress): void | Promise<void>;
  /** Replaces the built-in DFS swap / fee parsing of a mined receipt (`parseDfsReceiptEvents`). */
  parseReceiptEvents?(receipt: TxReceipt, tx: TxWrapper, network: NetworkNumber): Promise<EventData>;
  /** USD price for a token symbol. Enables the TxSaver minimum-sell check. */
  getAssetPriceUsd?(symbol: string, network: NetworkNumber): Promise<string>;
}
