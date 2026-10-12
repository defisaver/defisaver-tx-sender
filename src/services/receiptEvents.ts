import { actionAddresses } from '@defisaver/sdk';
import { assetAmountInEth, getAssetInfoByAddress } from '@defisaver/tokens';
import Dec from 'decimal.js';
import {
  decodeAbiParameters, type Hex, keccak256, toHex,
} from 'viem';
import { feeRecipientAbi } from '../abi';
import type { NetworkAddresses } from '../config/addresses';
import type { ChainAdapter } from '../interfaces/ChainAdapter';
import type { Logger } from '../interfaces/Logger';
import type {
  AdditionalInfoData, EthereumAddress, EventData, Fee, NetworkNumber, RecipeSwap, TxLog, TxReceipt,
} from '../types';
import { readContract } from './abi';
import { getErc20TokenData, getNativeAssetFromWrapped } from './assets';
import { compareAddresses, fromUnits, isLayer2Network } from './utils';

export const TRANSFER_TOPIC = keccak256(toHex('Transfer(address,address,uint256)'));
export const SWAP_TOPIC = keccak256(toHex('Swap(address,uint256,uint256,uint256,uint256,address)')); // Uniswap V2 style on-chain swap
export const TRANSFORMED_ERC20_TOPIC = keccak256(toHex('TransformedERC20(address,address,address,uint256,uint256)')); // 0x
export const DFS_SELL_TOPIC = keccak256(toHex('DFSSell'));

export interface SellEvent {
  wrapper: EthereumAddress;
  sellToken: EthereumAddress;
  buyToken: EthereumAddress;
  sellAmount: string;
  buyAmount: string;
  fee: string;
}

/** DFS action events wrap their payload in `bytes`; skip the offset and length words. */
const actionEventPayload = (log: TxLog): Hex => `0x${log.data.slice(130)}`;

/** Direct actions log the event name in topics[1], recipes in topics[2]. */
const isActionEvent = (log: TxLog, nameTopic: string) => compareAddresses(log.topics[1], nameTopic) || compareAddresses(log.topics[2], nameTopic);

const topicToAddress = (topic: string): EthereumAddress => `0x${topic.slice(26)}`;

const decodeUint = (data: string) => decodeAbiParameters([{ type: 'uint256' }], data as Hex)[0].toString();

export const getTransfersTo = (receipt: TxReceipt, to: EthereumAddress) => receipt.logs
  .filter((log) => compareAddresses(log.topics[0], TRANSFER_TOPIC) && log.topics[2] && compareAddresses(topicToAddress(log.topics[2]), to));

export const parseSellEvents = (receipt: TxReceipt): SellEvent[] => receipt.logs
  .filter((log) => isActionEvent(log, DFS_SELL_TOPIC))
  .map((log) => {
    const [wrapper, sellToken, buyToken, sellAmount, buyAmount, fee] = decodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
      actionEventPayload(log),
    );
    return {
      wrapper, sellToken, buyToken, sellAmount: sellAmount.toString(), buyAmount: buyAmount.toString(), fee: fee.toString(),
    };
  });

export const parseRecipeSwaps = async (chain: ChainAdapter, receipt: TxReceipt, network: NetworkNumber): Promise<RecipeSwap[]> => {
  const sells = parseSellEvents(receipt).filter((sell) => +sell.buyAmount > 0 || +sell.sellAmount > 0);
  return Promise.all(sells.map(async (sell) => {
    const [buyToken, sellToken] = await Promise.all([
      getErc20TokenData(chain, sell.buyToken, network),
      getErc20TokenData(chain, sell.sellToken, network),
    ]);
    const buyAmount = fromUnits(sell.buyAmount, buyToken.decimals);
    const sellAmount = fromUnits(sell.sellAmount, sellToken.decimals);
    return {
      buyToken, sellToken, buyAmount, sellAmount, swapRate: new Dec(sellAmount).div(buyAmount).toString(), wrapper: sell.wrapper,
    };
  }));
};

/** Service fees: ERC-20 transfers to the address `FeeRecipient` points at, summed per asset. */
export const parseServiceFees = async (
  chain: ChainAdapter, receipt: TxReceipt, network: NetworkNumber, feeRecipientContract: EthereumAddress,
): Promise<Fee[]> => {
  if (!feeRecipientContract) return [];
  const feeAddress = await readContract<EthereumAddress>(chain, feeRecipientContract, feeRecipientAbi, 'getFeeAddr');
  const transfers = getTransfersTo(receipt, feeAddress);
  const totals: Record<string, Dec> = {};
  for (const transfer of transfers) {
    const token = await getErc20TokenData(chain, transfer.address, network);
    const asset = getNativeAssetFromWrapped(token.symbol);
    const amount = fromUnits(decodeUint(transfer.data), token.decimals);
    totals[asset] = (totals[asset] || new Dec(0)).add(amount);
  }
  return Object.entries(totals)
    .filter(([, amount]) => amount.gt(0))
    .map(([feeAsset, amount]) => ({ feeAsset, feeAmount: amount.toNumber(), type: 'service' }));
};

/**
 * Aave flashloan fee: the difference between what the FL action received and what it paid back, per asset.
 * Aave V2 on mainnet, V3 on L2s.
 */
export const parseAaveFlashLoanFees = (receipt: TxReceipt, network: NetworkNumber): Fee[] => {
  const addresses = actionAddresses(network as unknown as null) as unknown as Record<string, string | undefined> | undefined;
  const flAction = isLayer2Network(network) ? addresses?.FLAaveV3 : addresses?.FLAaveV2;
  if (!flAction) return [];
  const deltas: Record<string, number> = {};
  getTransfersTo(receipt, flAction).forEach((transfer) => {
    const { symbol } = getAssetInfoByAddress(transfer.address, network);
    if (symbol === '?') return;
    const asset = getNativeAssetFromWrapped(symbol);
    const value = +assetAmountInEth(decodeUint(transfer.data), symbol);
    deltas[asset] = asset in deltas ? Math.abs(deltas[asset] - value) : value;
  });
  return Object.entries(deltas).map(([feeAsset, feeAmount]) => ({ feeAsset, feeAmount, type: 'aaveFL' }));
};

/**
 * Swap rate for exchange txs without a `DFSSell` event: from the 0x `TransformedERC20` event,
 * else from the first / last Uniswap-style `Swap` event using the tx's `firstToken` / `secondToken`.
 */
export const parseSwapRate = (receipt: TxReceipt, info: AdditionalInfoData, network: NetworkNumber, zeroXExchangeProxy: EthereumAddress): string => {
  const zeroX = zeroXExchangeProxy && receipt.logs.find((log) => compareAddresses(log.topics[0], TRANSFORMED_ERC20_TOPIC)
    && compareAddresses(log.address, zeroXExchangeProxy));
  if (zeroX) {
    const [inToken, outToken, inAmount, outAmount] = decodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }], zeroX.data as Hex,
    );
    const inEth = assetAmountInEth(inAmount.toString(), getAssetInfoByAddress(inToken, network).symbol);
    const outEth = assetAmountInEth(outAmount.toString(), getAssetInfoByAddress(outToken, network).symbol);
    return new Dec(inEth).div(outEth).toString();
  }
  const swaps = receipt.logs.filter((log) => compareAddresses(log.topics[0], SWAP_TOPIC));
  if (!swaps.length || !info.firstToken || !info.secondToken) return '0';
  const amounts = [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] as const;
  const [in0, in1] = decodeAbiParameters(amounts, swaps[0].data as Hex);
  const [, , out0, out1] = decodeAbiParameters(amounts, swaps[swaps.length - 1].data as Hex);
  const inEth = assetAmountInEth((in0 || in1).toString(), info.firstToken);
  const outEth = assetAmountInEth((out0 || out1).toString(), info.secondToken);
  return new Dec(inEth).div(outEth).toString();
};

export interface ParseReceiptEventsParams {
  chain: ChainAdapter;
  receipt: TxReceipt;
  network: NetworkNumber;
  addresses: Pick<NetworkAddresses, 'feeRecipient' | 'zeroXExchangeProxy'>;
  additionalInfo?: AdditionalInfoData;
  logger?: Logger;
}

/** Everything the success notification shows: recipe swaps, service + Aave FL fees, and a swap-rate fallback. */
export const parseDfsReceiptEvents = async ({
  chain, receipt, network, addresses, additionalInfo = {}, logger,
}: ParseReceiptEventsParams): Promise<EventData> => {
  const [recipeSwaps, serviceFees] = await Promise.all([
    parseRecipeSwaps(chain, receipt, network),
    // A missing fee is cosmetic; keep the swaps when the fee lookup fails.
    parseServiceFees(chain, receipt, network, addresses.feeRecipient).catch((err) => {
      logger?.captureException?.(err, { type: 'parseServiceFees', hash: receipt.transactionHash });
      return [] as Fee[];
    }),
  ]);
  const eventData: EventData = { recipeSwaps, fees: [...serviceFees, ...parseAaveFlashLoanFees(receipt, network)] };
  if (!recipeSwaps.length && additionalInfo.firstToken && additionalInfo.secondToken) {
    eventData.swapRate = parseSwapRate(receipt, additionalInfo, network, addresses.zeroXExchangeProxy);
  }
  return eventData;
};
