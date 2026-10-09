import Dec from 'decimal.js';
import { getAssetInfo, getAssetInfoByAddress } from '@defisaver/tokens';
import type { ChainAdapter } from '../interfaces/ChainAdapter';
import { erc20Abi } from '../abi';
import { CONTINUOUS_FEE_MULTIPLIER } from '../config/constants';
import { NetworkNumber, type EthereumAddress } from '../types';
import { readContract } from './abi';

export interface Erc20TokenData {
  symbol: string;
  address: EthereumAddress;
  decimals: number;
}

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

export const bumpAmountForApproval = (amount: string) => new Dec(amount).mul(CONTINUOUS_FEE_MULTIPLIER).toString();

/** Token metadata from @defisaver/tokens, falling back to on-chain `symbol()` / `decimals()`. */
export const getErc20TokenData = async (chain: ChainAdapter, address: EthereumAddress, network: NetworkNumber): Promise<Erc20TokenData> => {
  const known = getAssetInfoByAddress(address, network);
  if (known.symbol !== '?') return { symbol: known.symbol, address: known.address, decimals: known.decimals };
  const native = getAssetInfo(getNetworkNativeAsset(network), network);
  if (address.toLowerCase() === native.address.toLowerCase()) {
    return { symbol: native.symbol, address: native.address, decimals: native.decimals };
  }
  const [symbol, decimals] = await Promise.all([
    readContract<string>(chain, address, erc20Abi, 'symbol'),
    readContract<number | bigint>(chain, address, erc20Abi, 'decimals'),
  ]);
  return { symbol, address, decimals: Number(decimals) };
};
