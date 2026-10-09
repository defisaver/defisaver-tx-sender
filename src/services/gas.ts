import Dec from 'decimal.js';
import type { ChainAdapter } from '../interfaces/ChainAdapter';
import type { GasPriceProvider } from '../config/TxSenderConfig';
import { ESTIMATION_GAS_PRICE_FALLBACK } from '../config/constants';
import { NetworkNumber } from '../types';
import { gweiToWei, weiToGwei } from './utils';

const DEFAULT_TIP: Partial<Record<NetworkNumber, string>> = {
  [NetworkNumber.Eth]: '0.5',
  [NetworkNumber.Arb]: '0.01',
};

const FORK_MIN_BASE_FEE: Partial<Record<NetworkNumber, string>> = {
  [NetworkNumber.Eth]: '5',
  [NetworkNumber.Arb]: '0.01',
  [NetworkNumber.Base]: '0.01',
  [NetworkNumber.Linea]: '0.01',
  [NetworkNumber.Plasma]: '0.01',
  [NetworkNumber.Opt]: '0.01',
};

/** Base fee from the latest block plus a static tip. Apps usually replace this with a gas oracle. */
export const createDefaultGasPriceProvider = (chain: ChainAdapter): GasPriceProvider => async (network, isFork) => {
  const baseFeeWei = await chain.getLatestBaseFee();
  if (baseFeeWei === undefined) throw new Error('Chain does not expose baseFeePerGas');
  const rawBaseFee = weiToGwei(baseFeeWei);
  const baseFee = isFork ? Dec.max(rawBaseFee, FORK_MIN_BASE_FEE[network] || 0).toString() : rawBaseFee;
  let priorityFee = DEFAULT_TIP[network] || '0.01';
  if (network === NetworkNumber.Eth && new Dec(baseFee).lte(0.5)) {
    priorityFee = new Dec(baseFee).div(2).toFixed(2);
  }
  return { baseFee, priorityFee };
};

/** Wei gas price used for `eth_estimateGas`. Falls back to legacy gas price, then to 1 gwei. */
export const getGasPriceForEstimation = async (
  chain: ChainAdapter,
  gasPriceProvider: GasPriceProvider,
  network: NetworkNumber,
  isFork: boolean,
): Promise<string> => {
  try {
    const { baseFee, priorityFee } = await gasPriceProvider(network, isFork);
    return gweiToWei(new Dec(baseFee).add(priorityFee).toString());
  } catch {
    try {
      return await chain.getGasPrice();
    } catch {
      return ESTIMATION_GAS_PRICE_FALLBACK;
    }
  }
};
