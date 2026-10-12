import Dec from 'decimal.js';
import { getAssetInfo, getAssetInfoByAddress } from '@defisaver/tokens';
import type { ChainAdapter } from '../interfaces/ChainAdapter';
import { erc20Abi } from '../abi';
import { CONTINUOUS_FEE_MULTIPLIER } from '../config/constants';
import { NetworkNumber, type EthereumAddress, type TokenInfo } from '../types';
import { readContract } from './abi';

export type Erc20TokenData = TokenInfo;

const isPlasma = (network: NetworkNumber) => network === NetworkNumber.Plasma;

export const getNetworkNativeAsset = (network: NetworkNumber) => (isPlasma(network) ? 'XPL' : 'ETH');

export const isNativeAssetOnAnotherNetwork = (asset: string, network: NetworkNumber) => (
  isPlasma(network) ? asset === 'ETH' : asset === 'XPL'
);

export const getWrappedNativeAssetFromUnwrapped = (symbol: string) => {
  if (symbol === 'ETH') return 'WETH';
  if (symbol === 'XPL') return 'WXPL';
  return symbol;
};

export const getNativeAssetFromWrapped = (symbol: string) => {
  if (symbol === 'WETH') return 'ETH';
  if (symbol === 'WXPL') return 'XPL';
  return symbol;
};

export const bumpAmountForApproval = (amount: string) => new Dec(amount).mul(CONTINUOUS_FEE_MULTIPLIER).toString();

/**
 * Full @defisaver/tokens record for an address, falling back to on-chain `name()` / `symbol()` / `decimals()`
 * layered over the placeholder record so UI fields like `icon` are always present.
 */
export const getErc20TokenData = async (chain: ChainAdapter, address: EthereumAddress, network: NetworkNumber): Promise<Erc20TokenData> => {
  const known = getAssetInfoByAddress(address, network);
  if (known.symbol !== '?') return known;
  const native = getAssetInfo(getNetworkNativeAsset(network), network);
  if (address.toLowerCase() === native.address.toLowerCase()) return native;
  const [name, symbol, decimals] = await Promise.all([
    readContract<string>(chain, address, erc20Abi, 'name'),
    readContract<string>(chain, address, erc20Abi, 'symbol'),
    readContract<number | bigint>(chain, address, erc20Abi, 'decimals'),
  ]);
  return {
    ...getAssetInfo(symbol, network), name, symbol, decimals: Number(decimals), address,
  };
};
