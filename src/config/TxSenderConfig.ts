import type {
  ChainAdapter, Logger, StateProvider, TxHooks, UiAdapter,
} from '../interfaces';
import { consoleLogger } from '../interfaces/Logger';
import type { NetworkNumber } from '../types';
import type { AddressOverrides } from './addresses';
import { DEFAULT_MESSAGES, type Messages } from './messages';
import { TOKENS_NEED_REAPPROVE } from './constants';
import { SignatureStore } from '../core/SignatureStore';
import { DfsApi, type DfsApiOptions } from '../api/DfsApi';

/** Returns base fee and priority fee in gwei. */
export type GasPriceProvider = (network: NetworkNumber, isFork: boolean) => Promise<{ baseFee: string; priorityFee: string }>;

export interface TxSenderConfig {
  chain: ChainAdapter;
  state: StateProvider;
  ui: UiAdapter;
  api: DfsApiOptions; // DeFi Saver backend URLs. The calls themselves are part of the SDK.
  hooks?: TxHooks;
  logger?: Logger;
  messages?: Partial<Messages>;
  addresses?: AddressOverrides; // Per-network contract address overrides.
  gasPriceProvider?: GasPriceProvider; // Replaces the default `latest block base fee + static tip` estimation.
  /** Human labels for approve types, keyed by the `approveType` string. Defaults to the key itself. */
  approveTypeLabels?: Record<string, string>;
  tokensNeedReapprove?: string[];
  tenderly?: { account: string; project: string }; // Optional Tenderly project for simulation links in debug logs.
  debug?: boolean; // Verbose encoding logs.
  signatures?: SignatureStore; // Shared store for signatures produced by `TxType.TypedSignature` txs.
  txSaver?: {
    minSellUsdL1?: number; // Minimum sell size in USD for TxSaver to be offered. Defaults: 100 on L1, 10 on L2.
    minSellUsdL2?: number;
  };
}

export interface ResolvedTxSenderConfig extends Omit<TxSenderConfig, 'api'> {
  api: DfsApi;
  hooks: TxHooks;
  logger: Logger;
  messages: Messages;
  approveTypeLabels: Record<string, string>;
  tokensNeedReapprove: string[];
  debug: boolean;
  signatures: SignatureStore;
}

export const resolveConfig = (config: TxSenderConfig): ResolvedTxSenderConfig => {
  if (!config?.chain) throw new Error('TxSender: config.chain is required');
  if (!config.state) throw new Error('TxSender: config.state is required');
  if (!config.ui) throw new Error('TxSender: config.ui is required');
  if (!config.api?.apiUrl) throw new Error('TxSender: config.api.apiUrl is required');
  return {
    ...config,
    api: new DfsApi(config.api),
    hooks: config.hooks || {},
    logger: config.logger || consoleLogger,
    messages: { ...DEFAULT_MESSAGES, ...(config.messages || {}) },
    approveTypeLabels: config.approveTypeLabels || {},
    tokensNeedReapprove: config.tokensNeedReapprove || TOKENS_NEED_REAPPROVE,
    debug: !!config.debug,
    signatures: config.signatures || new SignatureStore(),
  };
};
