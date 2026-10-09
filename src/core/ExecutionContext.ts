import type { ResolvedTxSenderConfig } from '../config/TxSenderConfig';
import type { NetworkAddresses } from '../config/addresses';
import type { AccountType, EthereumAddress, NetworkNumber } from '../types';
import type TxWrapper from '../TxWrapper';
import type TxEncoder from './TxEncoder';
import type TxUtils from './TxUtils';
import type TxNotifier from './TxNotifier';

/** Snapshot of app state taken once per tx, shared by encoders, executors and utils. */
export interface Env {
  config: ResolvedTxSenderConfig;
  network: NetworkNumber;
  account: EthereumAddress;
  accountType: AccountType;
  isFork: boolean;
  forkId?: string;
  addresses: NetworkAddresses;
}

export interface ExecutionContext {
  tx: TxWrapper;
  env: Env;
  encoder: TxEncoder;
  txUtils: TxUtils;
  notifier: TxNotifier;
}
