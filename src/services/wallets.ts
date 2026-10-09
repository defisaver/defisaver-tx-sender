import type { StateProvider } from '../interfaces/StateProvider';
import type { AnyProxyWallet, EthereumAddress } from '../types';
import { compareAddresses } from './utils';

export const getProxyWalletByAddress = (state: StateProvider, address: EthereumAddress): AnyProxyWallet | undefined => (
  state.getSmartWallets().find((wallet) => compareAddresses(wallet.address, address))
);
