import type {
  EthereumAddress,
  ExecutionType,
  ISafeTxDataParams,
  SafeTxDataHashParams,
  SignatureData,
  TxReceipt,
} from './index';

export interface EstimationFailed { failed: true }

export type ExecutionResult = TxReceipt | SignatureData | EstimationFailed;

/** Encoded tx ready for estimation. `gasPrice` is only used for estimation calls. */
export interface TxParams {
  from: EthereumAddress;
  to: EthereumAddress;
  data: string;
  value: string;
  gas: number;
  gasPrice?: string;
}

export interface FinalTxParams {
  from: EthereumAddress;
  to: EthereumAddress;
  data: string;
  value: string;
  gas: number;
  type?: '0x2';
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  addSuffix?: boolean;
}

export interface EncoderSendRet {
  type: ExecutionType.Send;
  txParams: TxParams;
  realGas: number;
  failing: boolean;
  insufficientFunds?: boolean;
}

export interface EncoderSignRet {
  type: ExecutionType.Sign;
  signer: EthereumAddress;
  safeAddress: EthereumAddress;
  txDataHash: string;
  txDataHashParams: SafeTxDataHashParams;
  txDataParams: ISafeTxDataParams;
  failing: boolean;
  realGas: number;
}

export interface EncoderTxSaverRet {
  type: ExecutionType.Sign;
  originalEncoding: EncoderSignRet;
  safe: EthereumAddress;
  eoa: EthereumAddress;
  data: string;
  message_hash: string;
  refund_receiver: EthereumAddress;
}

export type EncodingReturnType = EncoderSignRet | EncoderSendRet;

export interface MultisigGasEstimateParams {
  to: string;
  value: string;
  data: string;
  operation: number;
}
