import type {
  EIP712TypedData, EthereumAddress, Hex, SignatureData, TxReceipt, NetworkNumber, ISafeTxDataParams,
} from '../types';
import type { FinalTxParams } from '../types/encoding';

export interface CallRequest {
  to: EthereumAddress;
  data: Hex;
  from?: EthereumAddress;
  value?: string; // wei
  gasPrice?: string; // wei
  gas?: number;
}

export interface AtomicCall {
  to: EthereumAddress;
  data: string;
  value: string; // hex-encoded wei
}

export interface SendCallsRequest {
  from: EthereumAddress;
  chainId: number;
  calls: AtomicCall[];
}

export interface SignSafeTxRequest {
  txDataHash: string;
  safeTxData: ISafeTxDataParams;
  network: NetworkNumber;
  signer: EthereumAddress;
  safeAddress: EthereumAddress;
}

/**
 * Everything the SDK needs from a blockchain library. Read calls may go to an RPC
 * provider, signing calls go to the user's wallet. See `adapters/` for viem and web3.
 */
export interface ChainAdapter {
  getChainId(): Promise<number>; // Chain the wallet is currently on. Compared against `StateProvider.getNetwork()` before sending.
  getCode(address: EthereumAddress): Promise<string>;
  getGasPrice(): Promise<string>; // wei, decimal string
  getLatestBaseFee(): Promise<string | undefined>; // Latest block base fee in wei, or undefined on pre-1559 chains.
  call(req: CallRequest): Promise<Hex>;
  estimateGas(req: CallRequest): Promise<number>;
  getTransactionReceipt(hash: string): Promise<TxReceipt | null>;
  /**
   * Send and wait for the receipt. `onTxHash` must be awaited as soon as the hash is known.
   * Reject with the underlying error; attach `receipt` to it when the tx was mined but reverted.
   */
  sendTransaction(params: FinalTxParams, onTxHash: (hash: string) => Promise<void>): Promise<TxReceipt>;
  signMessage(message: string, signer: EthereumAddress): Promise<Hex>; // personal_sign
  signTypedData(typedData: EIP712TypedData, signer: EthereumAddress): Promise<Hex>; // eth_signTypedData_v4
  sendCalls?(req: SendCallsRequest): Promise<unknown>; // EIP-5792 `wallet_sendCalls`. Required only for `execute(..., { batch: true })`.
  /** Override Safe tx signing entirely (e.g. local signing on forks). Defaults to typed data with a personal_sign fallback. */
  signSafeTx?(req: SignSafeTxRequest): Promise<SignatureData>;
}
