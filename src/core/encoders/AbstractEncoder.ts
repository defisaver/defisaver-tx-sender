import type { Env } from '../ExecutionContext';
import type TxWrapper from '../../TxWrapper';
import { createDefaultGasPriceProvider, getGasPriceForEstimation } from '../../services/gas';
import { isInsufficientFundsEstimateError, requireAddress, requireContract } from '../../services/utils';
import { FAILED_ESTIMATE_GAS } from '../../config/constants';
import {
  type AnyProxyWallet, type EthereumAddress, ExecutionType, type GasEstimate, type Hex, type NetworkNumber, type SafeOperation,
} from '../../types';
import type { EncoderSendRet, EncoderSignRet, TxParams } from '../../types/encoding';
import { formatMessage } from '../../config/messages';

export interface EncodeOptions {
  forTxSaver?: boolean;
  operation?: SafeOperation;
}

export interface EncoderInit {
  tx: TxWrapper;
  executingAddress: EthereumAddress;
  fromAddress: EthereumAddress;
  proxyWallet: AnyProxyWallet | undefined;
  env: Env;
}

export default abstract class AbstractEncoder {
  BASE_TX_MULTIPLIER = 1.1;

  BASIC_TX_MULTIPLIER = 1.2;

  protected tx: TxWrapper;

  protected executingAddress: EthereumAddress;

  protected fromAddress: EthereumAddress;

  protected proxyWallet: AnyProxyWallet | undefined;

  protected env: Env;

  protected network: NetworkNumber;

  constructor(init: EncoderInit) {
    this.tx = init.tx;
    this.executingAddress = init.executingAddress;
    this.fromAddress = init.fromAddress;
    this.proxyWallet = init.proxyWallet;
    this.env = init.env;
    this.network = init.env.network;
  }

  protected get chain() { return this.env.config.chain; }

  abstract handleTxEncoding(executeParams: unknown[], ethValue: string, options?: EncodeOptions): Promise<EncoderSendRet | EncoderSignRet>;

  abstract getExecutionType(): Promise<ExecutionType>;

  abstract estimateTx(executeParams: unknown[], ethValue: string, options?: EncodeOptions): Promise<GasEstimate>;

  protected getGasPriceForEstimation(): Promise<string> {
    const provider = this.env.config.gasPriceProvider || createDefaultGasPriceProvider(this.chain);
    return getGasPriceForEstimation(this.chain, provider, this.network, this.env.isFork);
  }

  protected async requireCorrectChain() {
    const walletChain = await this.chain.getChainId();
    if (+walletChain !== +this.network) {
      throw new Error(formatMessage(this.env.config.messages.wrongNetwork, { '%network': this.network }));
    }
  }

  /** Common pre-send validation: addresses look right, targets have code, wallet is on the right chain. */
  protected async validateSendable(txParams: TxParams, extraContracts: EthereumAddress[] = []) {
    requireAddress(txParams.from);
    requireAddress(txParams.to);
    await requireContract(this.chain, txParams.to);
    for (const addr of extraContracts) await requireContract(this.chain, addr);
    await this.requireCorrectChain();
  }

  async estimateGas(txParams: TxParams, extraGas: number, minGas: number): Promise<GasEstimate> {
    let realGas: number;
    let gas: number;
    let failing = false;
    let insufficientFunds = false;
    try {
      realGas = await this.chain.estimateGas({
        from: txParams.from, to: txParams.to, data: txParams.data as Hex, value: txParams.value, gasPrice: txParams.gasPrice,
      });
      if (!realGas) throw new Error('No gas estimate');
      gas = this.calcGas(realGas, extraGas, minGas);
    } catch (err) {
      realGas = FAILED_ESTIMATE_GAS;
      gas = realGas;
      failing = true;
      insufficientFunds = isInsufficientFundsEstimateError(err);
    }
    return {
      gas, failing, realGas, insufficientFunds,
    };
  }

  calcGas(realGas: number, extraGas: number, minGas: number) {
    const multiplier = realGas < 500_000 ? this.BASIC_TX_MULTIPLIER : this.BASE_TX_MULTIPLIER;
    const gas = Math.floor(multiplier * (realGas + extraGas));
    return Math.max(gas, minGas);
  }

  /** Builds `TxParams` with an estimation gas price, then estimates. Shared by every proxy-style encoder. */
  protected async buildAndEstimate(to: EthereumAddress, data: Hex, ethValue: string): Promise<{ txParams: TxParams; gasData: GasEstimate }> {
    const txParams: TxParams = {
      from: this.fromAddress,
      to,
      value: ethValue,
      data,
      gas: 0,
      gasPrice: await this.getGasPriceForEstimation(),
    };
    const gasData = await this.estimateGas(txParams, this.tx.getExtraGas(), this.tx.getMinGas());
    txParams.gas = gasData.gas;
    return { txParams, gasData };
  }

  protected toSendRet(txParams: TxParams, gasData: GasEstimate): EncoderSendRet {
    return {
      type: ExecutionType.Send,
      txParams,
      failing: gasData.failing,
      insufficientFunds: gasData.insufficientFunds,
      realGas: gasData.realGas,
    };
  }
}
