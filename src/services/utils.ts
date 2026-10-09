import Dec from 'decimal.js';
import { isAddress } from 'viem';
import type { ChainAdapter } from '../interfaces/ChainAdapter';
import type { EthereumAddress, Hex, NetworkNumber } from '../types';

export const compareAddresses = (addr1 = '', addr2 = '') => addr1.toLowerCase() === addr2.toLowerCase();

export const isEmptyBytes = (value: string) => /^0x0*$/.test(value);

export const requireAddress: (address: unknown) => asserts address is EthereumAddress = (address) => {
  if (typeof address !== 'string') throw new Error('Address is not a string');
  if (address === '') throw new Error('Address is empty string');
  if (address.length < 42) throw new Error(`Address too short (${address.length} instead of 42)`);
  if (isEmptyBytes(address)) throw new Error('Address is empty bytes');
  if (!isAddress(address, { strict: false })) throw new Error('Address invalid');
};

export const requireContract = async (chain: ChainAdapter, address: EthereumAddress) => {
  const code = await chain.getCode(address);
  if (!code || isEmptyBytes(code)) throw new Error('Address is not a contract');
};

export const requireNotEmptyData = (data: unknown) => {
  if (data === undefined || data === null || data === '') throw new Error('Data is empty');
  if (new Dec(data as string).toString() === '0') throw new Error('Data is empty');
};

export const wait = (ms = 500) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Converts a decimal string to the smallest unit, truncating extra decimals. */
export const toUnits = (value: string | number, decimals: number): string => (
  new Dec(value || 0).mul(new Dec(10).pow(decimals)).floor().toFixed(0)
);

export const fromUnits = (value: string | number | bigint, decimals: number): string => (
  new Dec(value.toString() || 0).div(new Dec(10).pow(decimals)).toString()
);

export const gweiToWei = (gwei: string | number) => toUnits(gwei, 9);

export const weiToGwei = (wei: string | number | bigint) => fromUnits(wei, 9);

export const toHex = (value: string | number | bigint): Hex => `0x${BigInt(value).toString(16)}`;

export const isInsufficientFundsEstimateError = (err: unknown): boolean => {
  const e = err as { message?: unknown; data?: { message?: unknown }; error?: { message?: unknown } } | undefined;
  const message = [e?.message, e?.data?.message, e?.error?.message]
    .filter((m): m is string => typeof m === 'string')
    .join(' ');
  // Nodes report "gas required exceeds allowance" instead when value <= balance but gas can't be covered.
  return /insufficient funds|gas required exceeds allowance/i.test(message);
};

export const generateTenderlySimulationLink = (
  tenderly: { account: string; project: string },
  network: NetworkNumber,
  txParams: { from: string; to: string; data: string; value?: string },
) => {
  const query = [
    `network=${network}`,
    'gas=4000000',
    `from=${txParams.from}`,
    `value=${txParams.value || '0'}`,
    `contractAddress=${txParams.to}`,
    `rawFunctionInput=${txParams.data}`,
  ].join('&');
  return `https://dashboard.tenderly.co/${tenderly.account}/${tenderly.project}/simulator/new?${query}`;
};

export const formatTxHash = (txHash: string) => `${txHash.slice(0, 8)}...`;

export const isLayer2Network = (network: NetworkNumber) => [10, 8453, 42161, 59144, 9745].includes(+network);
