import type {
  EthereumAddress,
  ShowMevInfoData,
  SwapInjectInfo,
  TxSaverModalData,
} from './index';

/** Resolved from the confirm dialog for a regular send. */
export interface ConfirmationRet {
  isTxSaver: false;
  gasPrice: string; // gwei
  gasLimit: number;
  maxFee: string; // gwei
  priorityFee: string; // gwei
  isType2: boolean;
  approve?: string | number; // For exact approvals: user may switch to unlimited approval by resolving with MAXUINT.
  failed: false;
}

/** Resolved from the confirm dialog when the user opts into TxSaver. */
export interface TxSaverConfirmationRet {
  isTxSaver: true;
  maxFee: string;
  feeToken: string;
  tokenPriceInEth: string;
  gasEstimate: number;
  nonce?: number;
  useCustomNonce?: boolean;
  failed: false;
}

export interface TxConfirmFailureResolved { failed: true }

export type TxBatchConfirmation = { confirmed: boolean };

export type TxConfirmDataResolved =
  | ConfirmationRet
  | TxSaverConfirmationRet
  | TxConfirmFailureResolved
  | false;

export type TxConfirmDataFromSignResolved = TxSaverConfirmationRet | TxConfirmFailureResolved | boolean;

export interface TxConfirmData {
  from: EthereumAddress;
  to: EthereumAddress;
  data: string;
  value: string;
  gas: number;
  failing: boolean;
  insufficientFunds?: boolean; // failing specifically because the wallet can't cover gas * price + value
  realGas: number;
  title: string;
  id: string;
  protocol: string;
  isExactApproval: boolean;
  showMevInfo: ShowMevInfoData;
  showTxSaverToggle: boolean;
  isTxSaverTx?: boolean;
  txSaverData?: TxSaverModalData;
  gasCustomizationDisabled?: boolean;
  swapInjectInfo?: SwapInjectInfo | null;
}

export interface TxSignConfirmData {
  failing: boolean;
  realGas: number;
  gas: number;
  title: string;
  id: string;
  protocol: string;
  isExactApproval: boolean;
  safeAddress: string;
  isSubmittingNewMultisigTx: boolean;
  showTxSaverToggle: boolean;
  showMevInfo: ShowMevInfoData;
  isTxSaverTx?: boolean;
  txSaverData?: TxSaverModalData;
  swapInjectInfo?: SwapInjectInfo | null;
}

export interface TxConfirmBatchData {
  id: string;
  protocol: string;
  title: string;
  transactionList: unknown[];
}

export type NotificationStatus = 'pending' | 'pending-sign' | 'failed' | 'confirmed' | 'signed' | 'success';

export interface NotificationUpdate {
  status?: NotificationStatus;
  hidden?: boolean;
  description?: string;
  network?: string;
  hash?: string;
  txSaverTxId?: number;
  gasUsed?: number;
  eventData?: unknown;
  forkTxId?: string;
  loadingDfeData?: boolean;
  txTakingTooLong?: boolean;
  dfeData?: unknown;
  showPending?: boolean;
  mined?: boolean;
}
