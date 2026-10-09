import type { Abi } from 'viem';
import type { Recipe } from '@defisaver/sdk';

export type EthereumAddress = string;
export type Hex = `0x${string}`;
export type DecimalType = string;

export enum NetworkNumber {
  Eth = 1,
  Opt = 10,
  Base = 8453,
  Arb = 42161,
  Linea = 59144,
  Plasma = 9745,
  Hyperliquid = 1337,
}

/** Mirrors the account connection types used by the DeFi Saver app. Only Fork, GnosisSafe and ViewOnly change SDK behaviour. */
export enum AccountType {
  Browser = 'Browser',
  Ledger = 'ledger',
  Trezor = 'trezor',
  Fortmatic = 'fortmatic',
  WalletConnect = 'walletconnect',
  Coinbase = 'coinbase',
  GnosisSafe = 'gnosissafe',
  Debug = 'debug',
  ViewOnly = 'view-only',
  Fork = 'fork',
  CompoundExt = 'compound-ext',
}

export enum ProxyType {
  DSProxy = 'DSProxy',
  Safe = 'Safe',
  DSA = 'DSA',
  SummerFi = 'Summer.fi',
}

export enum SafeVersion {
  v100 = '1.0.0',
  v111 = '1.1.1',
  v120 = '1.2.0',
  v130 = '1.3.0',
  v141 = '1.4.1',
}

export interface ProxyWallet {
  type: ProxyType;
  address: EthereumAddress;
  ethBalance?: string;
}

export interface SafeWallet extends ProxyWallet {
  type: ProxyType.Safe;
  owners: EthereumAddress[];
  threshold: number;
  version: SafeVersion;
}

export interface DSAWallet extends ProxyWallet {
  type: ProxyType.DSA;
  id: string;
  version: string;
}

export interface SummerFiWallet extends ProxyWallet {
  type: ProxyType.SummerFi;
  id: string;
}

export type AnyProxyWallet = ProxyWallet | SafeWallet | DSAWallet | SummerFiWallet;

export enum TxType {
  Normal = 'Normal',
  SignPendingTx = 'SignPendingTx',
  ExecutePendingTx = 'ExecutePendingTx',
  CancelPendingTx = 'CancelPendingTx',
  Raw = 'Raw',
  TypedSignature = 'TypedSignature',
  SignForCreateAndExecute = 'SignForCreateAndExecute',
  ExecutePendingTxSaverTx = 'ExecutePendingTxSaverTx',
}

export enum SignatureType {
  ETH_SIGN = 'ETH_SIGN',
  ETH_SIGN_TYPED_DATA = 'ETH_SIGN_TYPED_DATA',
  PRE_APPROVED = 'PRE_APPROVED',
}

export enum TxLocalityType {
  LOCAL = 'LOCAL',
  EXTERNAL = 'EXTERNAL',
}

export enum ExecutionType {
  Send = 'Send',
  Sign = 'Sign',
}

/** Safe `execTransaction` operation. Recipes delegatecall; raw calldata is a plain call. */
export enum SafeOperation {
  Call = 0,
  DelegateCall = 1,
}

export enum TxOnBehalf {
  EOA = 'EOA',
  SW = 'SW',
}

export type EncoderType = 'EOA' | ProxyType;

/** Safe `getTransactionHash` arguments, positional. */
export type SafeTxDataHashParams = [
  to: EthereumAddress,
  value: string,
  data: string,
  operation: number,
  safeTxGas: number,
  baseGas: number,
  gasPrice: number,
  gasToken: EthereumAddress,
  refundReceiver: EthereumAddress,
  nonce: number,
];

/** Safe `execTransaction` arguments, positional. */
export type SafeExecTransactionParams = [
  to: EthereumAddress,
  value: string,
  data: string,
  operation: number,
  safeTxGas: number,
  baseGas: number,
  gasPrice: number,
  gasToken: EthereumAddress,
  refundReceiver: EthereumAddress,
  signatures: string,
];

/** Safe `setup` arguments, positional. */
export type SafeSetupParams = [
  owners: EthereumAddress[],
  threshold: number,
  to: EthereumAddress,
  data: string,
  fallbackHandler: EthereumAddress,
  paymentToken: EthereumAddress,
  payment: number,
  paymentReceiver: EthereumAddress,
];

export interface ISafeTxDataParams {
  to: EthereumAddress;
  value: string;
  data: string;
  operation: number;
  safeTxGas: number;
  baseGas: number;
  gasPrice: number;
  gasToken: EthereumAddress;
  refundReceiver: EthereumAddress;
  nonce: number;
}

export interface TxSaverMeta {
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
}

export interface AdditionalInfoData {
  firstToken?: string;
  firstAmount?: string;
  secondToken?: string;
  secondAmount?: string;
  [key: string]: unknown;
}

export interface MultisigTxMeta {
  protocol: string;
  title: string;
  minGas: number;
  extraGas: number;
  isTimeSensitive: boolean;
  hasSwap: boolean;
  category?: string;
  additionalInfo?: AdditionalInfoData;
  txSaverMeta?: TxSaverMeta;
}

export interface MultisigTxSignature {
  id: number;
  signature: string;
  signer: EthereumAddress;
  sigType: SignatureType;
  createdAt: string;
  updatedAt: string;
}

export interface MultisigTx {
  id: number;
  type: TxLocalityType;
  creator: EthereumAddress;
  txDataHash: string;
  network: number;
  status: string;
  meta: MultisigTxMeta;
  txData: SafeTxDataHashParams;
  signatures: MultisigTxSignature[];
  isCancel: boolean;
  createdAt: string;
  updatedAt: string;
  nonce: number;
}

export interface PendingTxData {
  txId: number;
  txDataHashParams: SafeTxDataHashParams;
  txDataHash: string;
  signatures: MultisigTxSignature[];
  txSaverMeta?: TxSaverMeta;
}

export interface MultisigTxForDb {
  txDataHash: string;
  safeAddress: EthereumAddress;
  txData: SafeTxDataHashParams;
  signature: string;
  creator: EthereumAddress;
  network: NetworkNumber;
  sigType: SignatureType;
  meta: MultisigTxMeta;
}

export interface MultisigSignatureForDb {
  signature: string;
  signer: EthereumAddress;
  sigType: SignatureType;
  txDataHash: string;
  txId: number;
  network: NetworkNumber;
}

export interface RecipeAssetApproval {
  owner: string;
  asset: string;
  specialApproveLabel?: string;
}

export interface RecipeNftApproval {
  owner: string;
  nft: EthereumAddress;
  tokenId: string;
  specialApproveLabel?: string;
}

export type RecipeApproval = RecipeNftApproval | RecipeAssetApproval;

export interface RecipeSwap {
  buyAmount: string;
  buyToken: unknown;
  sellAmount: string;
  sellToken: unknown;
  swapRate: string;
  wrapper: string;
}

export interface Fee {
  feeAmount: number;
  feeAsset: string;
  type: string;
}

export interface EventData {
  recipeSwaps: RecipeSwap[];
  fees: Fee[];
  swapRate?: string;
}

export interface TxLog {
  address: EthereumAddress;
  topics: string[];
  data: string;
  logIndex?: number;
}

/** Normalised receipt. Adapters map their library's receipt onto this shape. */
export interface TxReceipt {
  transactionHash: string;
  status: boolean;
  gasUsed: number;
  blockNumber: number;
  from: EthereumAddress;
  to: EthereumAddress | null;
  logs: TxLog[];
  txId?: string; // Fork simulation tx id, when the adapter exposes one.
  events?: Record<string, unknown>; // Legacy web3 decoded events, if present.
}

export type TxWParam<T> = T | (() => T) | (() => Promise<T>);

export interface ContractCallParams {
  address: EthereumAddress;
  abi: Abi;
  method: string; // Function name, or a full signature such as `execute(address,bytes)` to pin an overload.
  methodParams?: TxWParam<unknown[]>;
  ethValue?: string;
}

export interface RawTxCallParams {
  from: EthereumAddress;
  to: EthereumAddress;
  data: string;
}

export interface ApproveData {
  asset: string;
  spender: EthereumAddress;
  approveType: string;
  amount: DecimalType;
  assetAddress?: string;
}

export interface ShowMevInfoData {
  shouldShowMev?: boolean;
  amountToLoseInUSD?: string;
  slippagePercent: string;
}

export interface SwapInjectInfo {
  originalAmount: string;
  newAmount: string;
  changePercent: string;
  asset: string;
  newSource: string;
}

/** Subset of the app's `Swap` object the executor reads for route retries. Attached to a recipe as `recipe.swap`. */
export interface RecipeSwapInfo {
  amount: string;
  price?: string;
  lastFoundPrice: string;
  lastFoundExchangeSource: string | null;
  fetchedSwapOrders?: unknown[];
  fromTokenData: { symbol: string };
  toTokenData: { symbol: string };
}

export type RecipeWithSwap = Recipe & { swap?: RecipeSwapInfo };

export type RecipeBuilder = (swapSourcesBlacklist?: string[], swapOrders?: unknown[]) => Promise<Recipe>;

export interface EIP712TypedData {
  domain: {
    name?: string;
    version?: string;
    chainId?: number | string;
    verifyingContract?: string;
  };
  message: Record<string, unknown>;
  primaryType: string;
  types: {
    EIP712Domain: { name: string; type: string }[];
    [key: string]: { name: string; type: string }[];
  };
}

export interface SignatureData {
  signature: string;
  sigType: SignatureType;
}

export interface TxSaverModalData {
  totalSellAmount: string;
  symbol: string;
}

export interface TxSaverSubmitApiData {
  safe: EthereumAddress;
  eoa: EthereumAddress;
  data: string;
  title: string;
  category: string;
  message_hash: string;
  refund_receiver: EthereumAddress;
  signatures: Record<string, string>;
  gas_estimate: number;
}

export enum TxSaverStatus {
  IN_PROCESSING = 'IN_PROCESSING',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
}

export interface TxSaverStatusCheckApiReturnData {
  status: TxSaverStatus;
  txHash?: string;
  errorMsg?: string;
}

export interface GasEstimate {
  failing: boolean;
  realGas: number;
  gas: number;
  insufficientFunds?: boolean;
  recipe?: Recipe;
}
