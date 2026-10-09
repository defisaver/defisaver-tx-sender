import Dec from 'decimal.js';
import type { Recipe, TxSaverData } from '@defisaver/sdk';
import { getProxyWalletByAddress } from '../services/wallets';
import { processActionsForPrev } from '../services/recipe';
import { encodeCall } from '../services/abi';
import { compareAddresses, generateTenderlySimulationLink } from '../services/utils';
import { getDefaultSafeWalletObject } from '../services/safe';
import {
  type EncoderType,
  type EthereumAddress,
  ExecutionType,
  type GasEstimate,
  ProxyType,
  SafeOperation,
  SafeVersion,
  TxType,
} from '../types';
import type {
  EncoderSendRet, EncoderSignRet, EncoderTxSaverRet, EncodingReturnType,
} from '../types/encoding';
import type TxWrapper from '../TxWrapper';
import type { Env } from './ExecutionContext';
import AbstractEncoder, { type EncoderInit } from './encoders/AbstractEncoder';
import DSAEncoder from './encoders/DSAEncoder';
import DSProxyEncoder from './encoders/DSProxyEncoder';
import EoaEncoder from './encoders/EoaEncoder';
import SafeEncoder from './encoders/safe/SafeEncoder';
import SummerFiEncoder from './encoders/SummerFiEncoder';

const ENCODERS: Record<EncoderType, new (init: EncoderInit) => AbstractEncoder> = {
  EOA: EoaEncoder,
  [ProxyType.DSProxy]: DSProxyEncoder,
  [ProxyType.Safe]: SafeEncoder,
  [ProxyType.DSA]: DSAEncoder,
  [ProxyType.SummerFi]: SummerFiEncoder,
};

/**
 * Turns a `TxWrapper` into sendable tx params or a Safe hash to sign.
 * Routing: executing address == account → direct call; otherwise through the matching smart wallet encoder.
 */
export default class TxEncoder {
  constructor(private tx: TxWrapper, private env: Env) {}

  private get account() { return this.env.account; }

  private get network() { return this.env.network; }

  private getProxyAndType(executingAddress: EthereumAddress) {
    const proxyWallet = getProxyWalletByAddress(this.env.config.state, executingAddress);
    const type: EncoderType = proxyWallet?.type || 'EOA';
    return { proxyWallet, type };
  }

  private getEncoder(executingAddress: EthereumAddress): AbstractEncoder {
    const { proxyWallet, type } = this.getProxyAndType(executingAddress);
    return new ENCODERS[type]({
      tx: this.tx,
      executingAddress,
      fromAddress: this.account,
      proxyWallet,
      env: this.env,
    });
  }

  /** Safe encoder for a not-yet-deployed 1/1 Safe (create-and-execute flow). */
  private getPredictedSafeEncoder(executingAddress: EthereumAddress) {
    return new SafeEncoder({
      tx: this.tx,
      executingAddress,
      fromAddress: this.account,
      proxyWallet: getDefaultSafeWalletObject({
        address: executingAddress, owners: [executingAddress], threshold: 1, version: SafeVersion.v130,
      }),
      env: this.env,
    });
  }

  public async getExecutionType(): Promise<ExecutionType> {
    return this.getEncoder(await this.tx.getExecutingAddressInTime()).getExecutionType();
  }

  public async encodeTx(): Promise<EncodingReturnType> {
    const executingAddress = await this.tx.getExecutingAddressInTime();
    if (!executingAddress) throw new Error('TxWrapper: executingAddress is required');
    const isBatch = this.tx.getIsBatch();

    if (compareAddresses(this.account, executingAddress)) {
      return this.encodeForDirectCall(executingAddress, isBatch);
    }
    if (this.tx.type === TxType.Raw) return this.encodeForRawViaSafe(executingAddress);
    if (SafeEncoder.isPendingTxType(this.tx.getType())) return this.encodeForSafeMultisigPendingTx(executingAddress);
    if (this.tx.getContractCall() && this.tx.getMethod()) return this.encodeForProxyCall(executingAddress);

    const recipe = await this.buildRecipe();
    const { proxyWallet } = this.getProxyAndType(executingAddress);
    if (
      recipe.actions.length > 1
      || this.tx.getForceExecuteAsRecipe()
      || proxyWallet?.type === ProxyType.DSA
      || proxyWallet?.type === ProxyType.SummerFi
    ) {
      return this.encodeForRecipeViaProxyCall(recipe, executingAddress);
    }
    if (recipe.actions.length === 1) return this.encodeForActionViaProxyCall(recipe, executingAddress, isBatch);
    throw new Error('TxWrapper: contract and method or recipe are required');
  }

  private async buildRecipe(fresh = false): Promise<Recipe> {
    const recipe = fresh
      ? await this.tx.recipe(this.tx.swapSourcesBlacklist, this.tx.swapOrders)
      : await this.tx.getRecipeWithChecks();
    recipe.actions = processActionsForPrev(recipe.actions);
    this.tx.setExecutedRecipe(recipe);
    return recipe;
  }

  private debug(...args: unknown[]) {
    if (this.env.config.debug) this.env.config.logger.debug(args.map(String).join(' '), ...args.filter((a) => typeof a === 'object'));
  }

  private logDebugLink(encoded: EncodingReturnType) {
    if (!this.env.config.debug) return;
    const { logger, tenderly } = this.env.config;
    logger.debug(`Transaction ${encoded.failing ? 'failing' : 'working'}`);
    if (!tenderly) return;
    const txParams = encoded.type === ExecutionType.Send
      ? encoded.txParams
      : {
        from: encoded.signer, to: encoded.txDataHashParams[0], data: encoded.txDataHashParams[2], value: encoded.txDataHashParams[1],
      };
    logger.debug(generateTenderlySimulationLink(tenderly, this.network, {
      from: txParams.from, to: txParams.to, data: txParams.data, value: new Dec(txParams.value || 0).toString(),
    }));
  }

  private async getParamsForProxyCallEncoding(tx: TxWrapper) {
    const ethValue = tx.getEthValue();
    const methodParams = await tx.getMethodParamsInTime();
    const call = tx.getContractCall()!;
    const encodedData = encodeCall(call.abi, tx.getMethod(), methodParams);
    const executeParams = [tx.getContractAddress(), encodedData];
    return { methodParams, executeParams, ethValue };
  }

  private async encodeForProxyCall(executingAddress: EthereumAddress) {
    const encoder = this.getEncoder(executingAddress);
    const { methodParams, executeParams, ethValue } = await this.getParamsForProxyCallEncoding(this.tx);
    const encoded = await encoder.handleTxEncoding(executeParams, ethValue);
    this.debug(`Calling ${this.tx.getMethod()} at ${executeParams[0]} via ${this.getProxyAndType(executingAddress).type} at ${executingAddress}`, { methodParams, executeParams, encoded });
    return encoded;
  }

  private async getParamsForActionViaProxyEncoding(recipe: Recipe) {
    const action = recipe.actions[0];
    const ethValue = await action.getEthValue();
    const executeParams = action.encodeForDsProxyCall();
    return { action, executeParams, ethValue };
  }

  private async encodeForActionViaProxyCall(recipe: Recipe, executingAddress: EthereumAddress, isBatch = false) {
    const encoder = this.getEncoder(executingAddress);
    const { action, executeParams, ethValue } = await this.getParamsForActionViaProxyEncoding(recipe);
    const encoded = await encoder.handleTxEncoding(executeParams, ethValue);
    if (!isBatch) {
      this.debug(`Calling action "${action.name}" at ${action.contractAddress} via ${this.getProxyAndType(executingAddress).type} at ${executingAddress}`, { args: action.args, executeParams, encoded });
      this.logDebugLink(encoded);
    }
    return encoded;
  }

  private async getParamsForRecipeViaProxyEncoding(recipe: Recipe) {
    const ethValue = await recipe.getEthValue();
    const executeParams = recipe.encodeForDsProxyCall();
    return { executeParams, ethValue };
  }

  private async encodeForRecipeViaProxyCall(recipe: Recipe, executingAddress: EthereumAddress) {
    const encoder = this.getEncoder(executingAddress);
    const { executeParams, ethValue } = await this.getParamsForRecipeViaProxyEncoding(recipe);
    const encoded = await encoder.handleTxEncoding(executeParams, ethValue);
    this.debug(`Calling recipe "${recipe.name}" at ${recipe.recipeExecutorAddress} via ${this.getProxyAndType(executingAddress).type} at ${executingAddress}`, { actions: recipe.actions, executeParams, encoded });
    this.logDebugLink(encoded);
    return encoded;
  }

  private async getParamsForDirectCallEncoding(tx: TxWrapper) {
    return { methodParams: await tx.getMethodParamsInTime(), ethValue: tx.getEthValue() };
  }

  private async encodeForDirectCall(executingAddress: EthereumAddress, isBatch = false) {
    const encoder = this.getEncoder(executingAddress);
    const { methodParams, ethValue } = await this.getParamsForDirectCallEncoding(this.tx);
    const encoded = await encoder.handleTxEncoding(methodParams, ethValue);
    if (!isBatch) {
      this.debug(`Calling contract at ${this.tx.getContractAddress()} directly from EOA ${executingAddress}`, { methodParams, encoded });
      this.logDebugLink(encoded);
    }
    return encoded;
  }

  private async encodeForSafeMultisigPendingTx(executingAddress: EthereumAddress) {
    const encoder = this.getEncoder(executingAddress) as SafeEncoder;
    const encoded = await encoder.handlePendingTxEncoding(this.tx);
    this.debug(`Calling pre-made pending tx at ${executingAddress}`, { encoded });
    this.logDebugLink(encoded);
    return encoded;
  }

  /**
   * Requires: executing wallet is a Safe, tx value is 0, recipe has exactly one supported sell
   * action, and `encodeTx()` already ran so `executedRecipe` is set.
   */
  public async encodeForTxSaver(executingAddress: EthereumAddress, txSaverRecipeData: TxSaverData): Promise<EncoderTxSaverRet> {
    const encoder = this.getEncoder(executingAddress) as SafeEncoder;
    const recipe = this.tx.getExecutedRecipe();
    const executeParams = recipe.encodeForTxSaverCall(txSaverRecipeData);
    const encoded = await encoder.handleTxEncoding(executeParams, '0', { forTxSaver: true }) as EncoderSignRet;
    this.debug(`TxSaver recipe "${recipe.name}" via Safe at ${executingAddress}`, { executeParams, txSaverRecipeData, encoded });
    this.logDebugLink(encoded);
    return {
      type: ExecutionType.Sign,
      originalEncoding: encoded,
      data: encoded.txDataHashParams[2],
      eoa: encoded.signer,
      message_hash: encoded.txDataHash,
      refund_receiver: encoded.txDataHashParams[8],
      safe: encoded.safeAddress,
    };
  }

  /** Safe tx data (nonce 0) for a Safe that will be created in the same tx. */
  public async encodeCreateAndExecuteData() {
    const executingAddress = await this.tx.getExecutingAddressInTime();
    const encoder = this.getPredictedSafeEncoder(executingAddress);
    const recipe = await this.buildRecipe();
    const callData = recipe.encodeForDsProxyCall()[1];
    return encoder.getSafeTxDataParams(recipe.recipeExecutorAddress, '0', callData, 1, 0);
  }

  public async estimateTx(): Promise<GasEstimate> {
    const executingAddress = await this.tx.getExecutingAddressInTime();
    if (!executingAddress) throw new Error('TxWrapper: executingAddress is required');
    const encoder = this.getEncoder(executingAddress);
    const tx = this.tx;

    // Same routing rule as encodeTx: compare against the account, not the selected proxy.
    if (compareAddresses(this.account, executingAddress)) {
      const { methodParams, ethValue } = await this.getParamsForDirectCallEncoding(tx);
      return encoder.estimateTx(methodParams, ethValue);
    }
    if (tx.type === TxType.Raw) return this.estimateRawViaSafe(executingAddress);
    if (SafeEncoder.isPendingTxType(tx.getType())) return (encoder as SafeEncoder).estimatePendingTx(tx);
    if (tx.getContractCall() && tx.getMethod()) {
      const { executeParams, ethValue } = await this.getParamsForProxyCallEncoding(tx);
      return encoder.estimateTx(executeParams, ethValue);
    }

    const recipe = await this.buildRecipe(true);
    if (recipe.actions.length > 1 || tx.getForceExecuteAsRecipe()) {
      const { executeParams, ethValue } = await this.getParamsForRecipeViaProxyEncoding(recipe);
      return { ...(await encoder.estimateTx(executeParams, ethValue)), recipe };
    }
    if (recipe.actions.length === 1) {
      const { executeParams, ethValue } = await this.getParamsForActionViaProxyEncoding(recipe);
      return { ...(await encoder.estimateTx(executeParams, ethValue)), recipe };
    }
    return { failing: false, realGas: 0, gas: 0 };
  }

  /** Raw calldata needs a plain CALL; DSProxy, DSA and Summer.fi only delegatecall, so only a Safe can relay it. */
  private requireSafeForRaw(executingAddress: EthereumAddress): SafeEncoder {
    const { type } = this.getProxyAndType(executingAddress);
    if (type !== ProxyType.Safe) {
      throw new Error(`TxWrapper: raw calldata can be sent from the account or through a Safe, not via ${type} at ${executingAddress}`);
    }
    return this.getEncoder(executingAddress) as SafeEncoder;
  }

  private getParamsForRawViaSafe() {
    const raw = this.tx.rawTxCallParams!;
    return { executeParams: [raw.to, raw.data], ethValue: this.tx.getEthValue() };
  }

  private async encodeForRawViaSafe(executingAddress: EthereumAddress) {
    const encoder = this.requireSafeForRaw(executingAddress);
    const { executeParams, ethValue } = this.getParamsForRawViaSafe();
    const encoded = await encoder.handleTxEncoding(executeParams, ethValue, { operation: SafeOperation.Call });
    this.debug(`Calling ${executeParams[0]} with raw calldata via Safe at ${executingAddress}`, { executeParams, encoded });
    this.logDebugLink(encoded);
    return encoded;
  }

  private async estimateRawViaSafe(executingAddress: EthereumAddress): Promise<GasEstimate> {
    const encoder = this.requireSafeForRaw(executingAddress);
    const { executeParams, ethValue } = this.getParamsForRawViaSafe();
    return encoder.estimateTx(executeParams, ethValue, { operation: SafeOperation.Call });
  }

  public async estimateForTxSaver(executingAddress: EthereumAddress, txSaverRecipeData: TxSaverData): Promise<GasEstimate> {
    const encoder = this.getEncoder(executingAddress) as SafeEncoder;
    const recipe = this.tx.getExecutedRecipe();
    const executeParams = recipe.encodeForTxSaverCall(txSaverRecipeData);
    return { ...(await encoder.estimateTx(executeParams, '0', { forTxSaver: true })), recipe };
  }

  public async estimateCreateAndExecute(): Promise<GasEstimate> {
    const executingAddress = await this.tx.getExecutingAddressInTime();
    const encoder = this.getPredictedSafeEncoder(executingAddress);
    const recipe = await this.buildRecipe(true);
    if (recipe.actions.length > 1 || this.tx.getForceExecuteAsRecipe()) {
      const { executeParams, ethValue } = await this.getParamsForRecipeViaProxyEncoding(recipe);
      return { ...(await encoder.estimateTx(executeParams, ethValue)), recipe };
    }
    if (recipe.actions.length === 1) {
      const { executeParams, ethValue } = await this.getParamsForActionViaProxyEncoding(recipe);
      return encoder.estimateTx(executeParams, ethValue);
    }
    return { failing: false, realGas: 0, gas: 0 };
  }

  /** Exposes the encoded send params without side effects; used by batching. */
  public async encodeForBatch(): Promise<EncoderSendRet> {
    this.tx.setIsBatch(true);
    return (await this.encodeTx()) as EncoderSendRet;
  }
}
