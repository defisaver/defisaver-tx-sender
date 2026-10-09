import semverSatisfies from 'semver/functions/satisfies';
import {
  decodeAbiParameters, decodeFunctionResult, encodeFunctionData, type Hex,
} from 'viem';
import { multicallAbi, safeAbi, simulateTxAccessorAbi } from '../../../abi';
import type { Env } from '../../ExecutionContext';
import { createDefaultGasPriceProvider, getGasPriceForEstimation } from '../../../services/gas';
import type { SafeWallet } from '../../../types';
import type { MultisigGasEstimateParams } from '../../../types/encoding';

interface GasData {
  failing: boolean;
  gasUsed: number;
}

/**
 * Gas for a Safe tx that cannot be sent yet (missing signatures). Uses `simulateAndRevert`
 * on Safe >= 1.3.0 and `requiredTxGas` on older versions.
 */
export default class SafeMultisigGasEstimator {
  ADDITIONAL_GAS = 64_000; // Safe execution overhead. Re-estimated precisely once all signatures are collected.

  constructor(private env: Env) {}

  private get chain() { return this.env.config.chain; }

  private getGasPriceForEstimation() {
    const provider = this.env.config.gasPriceProvider || createDefaultGasPriceProvider(this.chain);
    return getGasPriceForEstimation(this.chain, provider, this.env.network, this.env.isFork);
  }

  public async estimateMultisigTxGas(wallet: SafeWallet, params: MultisigGasEstimateParams) {
    const gasData = semverSatisfies(wallet.version, '>=1.3.0')
      ? await this.estimateGasWithSimulate(wallet, params)
      : await this.estimateGasWithRequiredTxGas(wallet, params);
    return { realGas: gasData.gasUsed + this.ADDITIONAL_GAS, failing: gasData.failing };
  }

  private async estimateGasWithSimulate(wallet: SafeWallet, params: MultisigGasEstimateParams): Promise<GasData> {
    const { safeSimulateTxAccessor, multicall } = this.env.addresses;
    try {
      const simulateData = encodeFunctionData({
        abi: simulateTxAccessorAbi,
        functionName: 'simulate',
        args: [params.to as Hex, BigInt(params.value), params.data as Hex, params.operation],
      });
      const estimateData = encodeFunctionData({
        abi: safeAbi,
        functionName: 'simulateAndRevert',
        args: [safeSimulateTxAccessor as Hex, simulateData],
      });
      const multicallData = encodeFunctionData({
        abi: multicallAbi,
        functionName: 'multicall',
        args: [[{ target: wallet.address as Hex, gasLimit: 1_000_000n, callData: estimateData }]],
      });
      const gasPrice = await this.getGasPriceForEstimation();
      const raw = await this.chain.call({ to: multicall, data: multicallData, gasPrice });
      const [, results] = decodeFunctionResult({ abi: multicallAbi, functionName: 'multicall', data: raw });
      const revertData = results[0].returnData;
      // Layout: [success(32)][offset(32)][gasUsed(32)][returnData...]
      const [success] = decodeAbiParameters([{ type: 'bool' }], `0x${revertData.slice(2, 66)}` as Hex);
      const [gasUsed] = decodeAbiParameters([{ type: 'uint256' }], `0x${revertData.slice(130, 194)}` as Hex);
      return { failing: !success, gasUsed: Number(gasUsed) };
    } catch (e) {
      this.env.config.logger.error('Safe simulate estimation failed', { error: e });
      throw new Error('Could not estimate required gas limit.');
    }
  }

  private async estimateGasWithRequiredTxGas(wallet: SafeWallet, params: MultisigGasEstimateParams): Promise<GasData> {
    // Must be called from the Safe itself, so multicall cannot be used here.
    const estimateData = encodeFunctionData({
      abi: safeAbi,
      functionName: 'requiredTxGas',
      args: [params.to as Hex, BigInt(params.value), params.data as Hex, params.operation],
    });
    try {
      const gasPrice = await this.getGasPriceForEstimation();
      const estimate = await this.chain.estimateGas({
        from: wallet.address, to: wallet.address, data: estimateData, gasPrice,
      });
      const gasUsed = Number(`0x${estimate.toString(16).slice(-32)}`);
      return { failing: false, gasUsed };
    } catch (e) {
      const revertData = this.findRevertDataInError(e, 200);
      if (revertData) return { failing: false, gasUsed: Number(`0x${revertData.slice(-32)}`) };
      return { failing: true, gasUsed: 0 };
    }
  }

  /** Wallets format revert data differently; find a `0x` + responseLength hex blob anywhere in the error. */
  private findRevertDataInError(error: unknown, responseLength: number): string | undefined {
    try {
      const err = error as { message?: string; data?: unknown; info?: unknown };
      const candidates = [err?.message, JSON.stringify(err?.data), JSON.stringify(err?.info), JSON.stringify(err)];
      const text = candidates.find((c) => typeof c === 'string' && c.includes('0x'));
      return text?.match(new RegExp(`0x([0-9a-fA-F]{${responseLength}})([^0-9a-fA-F]|$)`))?.[1];
    } catch {
      return undefined;
    }
  }
}
