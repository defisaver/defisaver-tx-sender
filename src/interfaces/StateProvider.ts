import type {
  AccountType, AnyProxyWallet, EthereumAddress, NetworkNumber,
} from '../types';

/** Application state the SDK reads. Implemented by the host app (e.g. backed by a Redux store). */
export interface StateProvider {
  getNetwork(): NetworkNumber;
  getAccount(): EthereumAddress;
  getAccountType(): AccountType;
  getProxyAddress(): EthereumAddress; // Currently selected smart wallet, or '' when none.
  getSmartWallets(): AnyProxyWallet[]; // All smart wallets owned by the account on the current network.
  getForkId?(): string | undefined; // Tenderly fork id when connected to a fork. Forwarded to backend calls.
}
