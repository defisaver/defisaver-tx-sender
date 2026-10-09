import { safeAbi } from '../../../abi';
import { SAFE_REFUND_RECEIVER, ZERO_ADDRESS } from '../../../config/constants';
import { encodeCall, readContract } from '../../../services/abi';
import { getNextSafeWalletNonce } from '../../../services/safe';
import {
  type EthereumAddress,
  ExecutionType,
  type GasEstimate,
  type ISafeTxDataParams,
  type MultisigTxSignature,
  type SafeExecTransactionParams,
  type SafeTxDataHashParams,
  type SafeWallet,
  TxType,
} from '../../../types';
import type { EncoderSendRet, EncoderSignRet } from '../../../types/encoding';
import type TxWrapper from '../../../TxWrapper';
import AbstractEncoder, { type EncodeOptions, type EncoderInit } from '../AbstractEncoder';
import SafeMultisigGasEstimator from './SafeMultisigGasEstimator';
import { SafeSignatureMaker } from './SafeSignatureMaker';

const DELEGATE_CALL = 1;

const PENDING_TX_TYPES = [TxType.SignPendingTx, TxType.ExecutePendingTx, TxType.CancelPendingTx, TxType.ExecutePendingTxSaverTx];

/**
 * Safe smart wallet. 1/1 Safes send `execTransaction` directly with a pre-approved signature;
 * m/n Safes produce a tx hash to sign and store off-chain until enough signatures exist.
 */
export default class SafeEncoder extends AbstractEncoder {
  signatureMaker = SafeSignatureMaker;

  gasEstimator: SafeMultisigGasEstimator;

  constructor(init: EncoderInit) {
    super(init);
    this.gasEstimator = new SafeMultisigGasEstimator(init.env);
  }

  private get wallet() {
    return this.proxyWallet as SafeWallet;
  }

  private getRequiresMultipleSignatures() {
    return this.wallet.threshold > 1;
  }

  async getExecutionType() {
    const txType = this.tx.getType();
    if (
      ((txType === TxType.Normal || txType === TxType.Raw) && this.getRequiresMultipleSignatures())
      || txType === TxType.SignPendingTx
      || txType === TxType.CancelPendingTx
    ) return ExecutionType.Sign;
    return ExecutionType.Send;
  }

  async handleTxEncoding(executeParams: unknown[], ethValue: string, options?: EncodeOptions) {
    const [to, callData] = executeParams as [string, string];
    const operation = options?.operation ?? DELEGATE_CALL;
    if (this.getRequiresMultipleSignatures() || options?.forTxSaver) {
      return this.getSignature(to, callData, ethValue, operation, options);
    }
    const preApprovedSig = this.signatureMaker.generatePreApproveSignature(this.fromAddress);
    const execParams = await this.getSafeOneOneExecTransactionParams(to, ethValue, callData, preApprovedSig, operation);
    return this.encodeSendableTx(execParams, ethValue);
  }

  private async resolveNonce(options?: { forTxSaver?: boolean }): Promise<number | undefined> {
    if (this.tx.nonce) return this.tx.nonce;
    if (options?.forTxSaver) return getNextSafeWalletNonce(this.chain, this.executingAddress);
    return undefined;
  }

  private async getSignature(to: string, callData: string, ethValue: string, operation: number, options?: EncodeOptions): Promise<EncoderSignRet> {
    const nonce = await this.resolveNonce(options);
    const txDataHashParams = await this.getSafeTxDataHashParams(to, ethValue, callData, operation, nonce);
    const txDataHash = await this.getTxDataHash(txDataHashParams);
    const txDataParams = this.transformSafeTxDataArrayToObject(txDataHashParams);
    const gasData = await this.estimatePendingMultisigTxGas(txDataHashParams);
    return {
      type: ExecutionType.Sign,
      signer: this.fromAddress,
      txDataHash,
      txDataHashParams,
      txDataParams,
      failing: gasData.failing,
      realGas: gasData.realGas,
      safeAddress: this.executingAddress,
    };
  }

  async encodeSendableTx(execParams: SafeExecTransactionParams, userEthValue: string): Promise<EncoderSendRet> {
    const data = encodeCall(safeAbi, 'execTransaction', execParams);
    const { txParams, gasData } = await this.buildAndEstimate(this.executingAddress, data, userEthValue);
    await this.validateSendable(txParams, [execParams[0]]);
    return this.toSendRet(txParams, gasData);
  }

  async handlePendingTxEncoding(tx: TxWrapper): Promise<EncoderSendRet | EncoderSignRet> {
    const pending = tx.getPendingTxData()!;
    const txDataHash = await this.getTxDataHash(pending.txDataHashParams);
    if (txDataHash !== pending.txDataHash) throw new Error('txDataHash mismatch');

    const txType = tx.getType();
    if (txType === TxType.SignPendingTx || txType === TxType.ExecutePendingTxSaverTx) {
      const gasData = await this.estimatePendingMultisigTxGas(pending.txDataHashParams);
      return {
        type: ExecutionType.Sign,
        signer: this.fromAddress,
        txDataHash: pending.txDataHash,
        txDataHashParams: pending.txDataHashParams,
        txDataParams: this.transformSafeTxDataArrayToObject(pending.txDataHashParams),
        failing: gasData.failing,
        realGas: gasData.realGas,
        safeAddress: this.executingAddress,
      };
    }
    if (txType === TxType.ExecutePendingTx) {
      const sigs = [...pending.signatures];
      if (this.wallet.threshold - sigs.length === 1) {
        sigs.push(this.signatureMaker.generatePreApproveSignature(this.fromAddress));
      }
      if (sigs.length < this.wallet.threshold) throw new Error('Not enough signatures');
      const execParams = await this.getSafeMultisigExecTransactionParams(
        pending.txDataHashParams,
        pending.txDataHash,
        sigs.slice(0, this.wallet.threshold),
      );
      return this.encodeSendableTx(execParams, execParams[1].toString());
    }
    if (txType === TxType.CancelPendingTx) {
      const cancelParams = this.getCancelTxDataHashParams(pending.txDataHashParams);
      const cancelHash = await this.getTxDataHash(cancelParams);
      const gasData = await this.estimatePendingMultisigTxGas(cancelParams);
      return {
        type: ExecutionType.Sign,
        signer: this.fromAddress,
        txDataHash: cancelHash,
        txDataHashParams: cancelParams,
        txDataParams: this.transformSafeTxDataArrayToObject(cancelParams),
        failing: gasData.failing,
        realGas: gasData.realGas,
        safeAddress: this.executingAddress,
      };
    }
    throw new Error(`Unsupported tx type: ${txType}`);
  }

  /** A cancel is an empty self-call that burns the same nonce. */
  private getCancelTxDataHashParams(params: SafeTxDataHashParams): SafeTxDataHashParams {
    const cancel: SafeTxDataHashParams = [...params];
    cancel[0] = this.executingAddress;
    cancel[1] = '0';
    cancel[2] = '0x';
    return cancel;
  }

  private estimatePendingMultisigTxGas(params: SafeTxDataHashParams) {
    return this.gasEstimator.estimateMultisigTxGas(this.wallet, {
      to: params[0], value: params[1], data: params[2], operation: params[3],
    });
  }

  async getTxDataHash(params: SafeTxDataHashParams): Promise<string> {
    return readContract<string>(this.chain, this.executingAddress, safeAbi, 'getTransactionHash', params);
  }

  async getSafeMultisigExecTransactionParams(
    params: SafeTxDataHashParams,
    txDataHash: string,
    sigs: MultisigTxSignature[],
  ): Promise<SafeExecTransactionParams> {
    if (sigs.length === 0) throw new Error('No signatures');
    const data = [...params] as unknown as SafeExecTransactionParams;
    data[9] = await this.signatureMaker.encodeSafeSignatures(sigs, txDataHash);
    return data;
  }

  async getSafeOneOneExecTransactionParams(to: string, ethValue: string, callData: string, sig: MultisigTxSignature, operation = DELEGATE_CALL): Promise<SafeExecTransactionParams> {
    return [
      to,
      ethValue,
      callData,
      operation,
      0,
      0,
      0,
      ZERO_ADDRESS,
      SAFE_REFUND_RECEIVER,
      await this.signatureMaker.encodeSafeSignatures([sig]),
    ];
  }

  private async getNonce(explicitNonce?: number) {
    if (explicitNonce !== undefined) return explicitNonce;
    return this.env.config.api.getNextSafeNonce(this.fromAddress, this.executingAddress, this.network, this.env.forkId);
  }

  async getSafeTxDataHashParams(to: string, ethValue: string, callData: string, callType = DELEGATE_CALL, explicitNonce?: number): Promise<SafeTxDataHashParams> {
    const nonce = await this.getNonce(explicitNonce);
    return [to, ethValue, callData, callType, 0, 0, 0, ZERO_ADDRESS, SAFE_REFUND_RECEIVER, +nonce];
  }

  async getSafeTxDataParams(to: string, ethValue: string, callData: string, callType = DELEGATE_CALL, explicitNonce?: number): Promise<ISafeTxDataParams> {
    const nonce = await this.getNonce(explicitNonce);
    return {
      to,
      value: ethValue,
      data: callData,
      operation: callType,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: 0,
      gasToken: ZERO_ADDRESS,
      refundReceiver: SAFE_REFUND_RECEIVER,
      nonce: +nonce,
    };
  }

  transformSafeTxDataArrayToObject(params: SafeTxDataHashParams): ISafeTxDataParams {
    return {
      to: params[0],
      value: params[1],
      data: params[2],
      operation: params[3],
      safeTxGas: params[4],
      baseGas: params[5],
      gasPrice: params[6],
      gasToken: params[7],
      refundReceiver: params[8],
      nonce: params[9],
    };
  }

  async estimateTx(executeParams: unknown[], ethValue: string, options?: EncodeOptions): Promise<GasEstimate> {
    const [to, callData] = executeParams as [string, string];
    const operation = options?.operation ?? DELEGATE_CALL;
    if (this.getRequiresMultipleSignatures() || options?.forTxSaver) {
      const nonce = await this.resolveNonce(options);
      const params = await this.getSafeTxDataHashParams(to, ethValue, callData, operation, nonce);
      const gasData = await this.estimatePendingMultisigTxGas(params);
      return { ...gasData, gas: 0 };
    }
    const preApprovedSig = this.signatureMaker.generatePreApproveSignature(this.fromAddress);
    const execParams = await this.getSafeOneOneExecTransactionParams(to, ethValue, callData, preApprovedSig, operation);
    const data = encodeCall(safeAbi, 'execTransaction', execParams);
    const { gasData } = await this.buildAndEstimate(this.executingAddress, data, ethValue);
    return gasData;
  }

  async estimatePendingTx(tx: TxWrapper): Promise<GasEstimate> {
    const pending = tx.getPendingTxData()!;
    const txDataHash = await this.getTxDataHash(pending.txDataHashParams);
    if (txDataHash !== pending.txDataHash) throw new Error('txDataHash mismatch');
    const txType = tx.getType();
    if (txType === TxType.SignPendingTx || txType === TxType.ExecutePendingTxSaverTx) {
      return { ...(await this.estimatePendingMultisigTxGas(pending.txDataHashParams)), gas: 0 };
    }
    if (txType === TxType.ExecutePendingTx) return { failing: false, realGas: 0, gas: 0 };
    if (txType === TxType.CancelPendingTx) {
      return { ...(await this.estimatePendingMultisigTxGas(this.getCancelTxDataHashParams(pending.txDataHashParams))), gas: 0 };
    }
    throw new Error(`Unsupported tx type: ${txType}`);
  }

  static isPendingTxType(type: TxType) {
    return PENDING_TX_TYPES.includes(type);
  }
}
