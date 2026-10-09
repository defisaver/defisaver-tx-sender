import { encodeFunctionData, type Hex } from 'viem';
import { erc20Abi } from '../abi';
import { DEFISAVER_IDENTIFICATION_SUFFIX, MAXUINT } from '../config/constants';
import { buildTypedData, SignType } from '../services/typedData';
import { gweiToWei, requireNotEmptyData, toHex } from '../services/utils';
import {
  type EIP712TypedData,
  type EthereumAddress,
  type EventData,
  type ISafeTxDataParams,
  type MultisigTxForDb,
  type NetworkNumber,
  SignatureType,
  type SignatureData,
  type TxReceipt,
} from '../types';
import type { ConfirmationRet } from '../types/confirm';
import type { EncoderSendRet, EncoderSignRet, FinalTxParams } from '../types/encoding';
import type TxWrapper from '../TxWrapper';
import type { Env } from './ExecutionContext';
import { SafeSignatureMaker } from './encoders/safe/SafeSignatureMaker';
import TxError from './TxError';

const ALLOWED_TX_KEYS = ['chainId', 'data', 'gasPrice', 'nonce', 'to', 'value', 'type', 'maxFeePerGas', 'maxPriorityFeePerGas', 'from', 'gas'];

/** Signing and sending helpers bound to the chain adapter. */
export default class TxUtils {
  constructor(private env: Env) {}

  private get chain() { return this.env.config.chain; }

  private get messages() { return this.env.config.messages; }

  async signSafeData(message: string, signer: EthereumAddress): Promise<SignatureData> {
    const signature = await this.chain.signMessage(message, signer);
    return {
      sigType: SignatureType.ETH_SIGN,
      signature: await SafeSignatureMaker.adjustVInSig({ signature, sigType: SignatureType.ETH_SIGN, signer }, message),
    };
  }

  async signTypedData(message: EIP712TypedData, signer: EthereumAddress): Promise<SignatureData> {
    const signature = await this.chain.signTypedData(message, signer);
    return { signature, sigType: SignatureType.ETH_SIGN_TYPED_DATA };
  }

  /** Typed-data signature with a personal_sign fallback for wallets that reject EIP-712. */
  async signSafeTx(
    txDataHash: string,
    safeTxData: ISafeTxDataParams,
    network: NetworkNumber,
    signer: EthereumAddress,
    safeAddress: EthereumAddress,
  ): Promise<SignatureData> {
    if (this.chain.signSafeTx) {
      return this.chain.signSafeTx({
        txDataHash, safeTxData, network, signer, safeAddress,
      });
    }
    try {
      const message = buildTypedData(SignType.SafeTx, SignType.EIP712DomainSafe, {
        domain: { chainId: network, verifyingContract: safeAddress },
        primaryType: SignType.SafeTx,
        message: safeTxData as unknown as Record<string, unknown>,
      });
      return await this.signTypedData(message, signer);
    } catch (err) {
      if ((err as Error)?.message === 'User rejected the request.') throw err;
      this.env.config.logger.warn('Typed data signing failed, falling back to personal_sign', { error: (err as Error)?.message });
      return this.signSafeData(txDataHash, signer);
    }
  }

  getTypedSignatureMessage(tx: TxWrapper): EIP712TypedData {
    return buildTypedData(
      tx.getSignaturePrimaryType()!,
      tx.getSignatureDomainType()!,
      tx.getSignatureInfo() as Omit<EIP712TypedData, 'types'>,
    );
  }

  async createTxParams(tx: TxWrapper, encoding: EncoderSendRet, confirmation: ConfirmationRet): Promise<FinalTxParams> {
    const {
      gasPrice, gasLimit, maxFee, priorityFee, isType2,
    } = confirmation;
    const txParams: FinalTxParams = {
      from: encoding.txParams.from,
      to: encoding.txParams.to,
      data: encoding.txParams.data,
      value: encoding.txParams.value,
      gas: gasLimit,
    };
    if (isType2) {
      txParams.type = '0x2';
      txParams.maxFeePerGas = toHex(gweiToWei(maxFee));
      txParams.maxPriorityFeePerGas = toHex(gweiToWei(priorityFee));
    } else {
      txParams.gasPrice = toHex(gweiToWei(gasPrice));
    }
    if (tx.isExactApproval && confirmation.approve === MAXUINT) { // User switched an exact approval to unlimited in the confirm dialog.
      const [spender] = await tx.getMethodParamsInTime();
      txParams.data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender as Hex, BigInt(MAXUINT)] });
    }
    return txParams;
  }

  /** Some wallets (Trezor) fail on unknown or undefined keys. */
  private removeExtraProperties(params: FinalTxParams): FinalTxParams {
    const cleaned: Record<string, unknown> = {};
    Object.entries(params).forEach(([key, value]) => {
      if (ALLOWED_TX_KEYS.includes(key) && value !== undefined) cleaned[key] = value;
    });
    return cleaned as unknown as FinalTxParams;
  }

  async executeTx(
    txParams: FinalTxParams,
    onTxHash: (txHash: string) => Promise<void>,
    onReceipt: (receipt: TxReceipt, initialTxHash: string) => Promise<void>,
    onError: (error: unknown, initialTxHash: string) => Promise<TxError>,
  ): Promise<TxReceipt> {
    let initialTxHash = '';
    try {
      requireNotEmptyData(txParams.data);
      const cleaned = this.removeExtraProperties(txParams);
      if (txParams.addSuffix) cleaned.data += DEFISAVER_IDENTIFICATION_SUFFIX;
      const receipt = await this.chain.sendTransaction(cleaned, async (hash) => {
        initialTxHash = hash;
        await onTxHash(hash);
      });
      await onReceipt(receipt, initialTxHash);
      return receipt;
    } catch (err) {
      if (err instanceof TxError) throw err;
      throw await onError(err, initialTxHash);
    }
  }

  getMultisigTxForDb(tx: TxWrapper, encoding: EncoderSignRet, sigType: SignatureType, signature: string, network: NetworkNumber, forTxSaver: boolean): MultisigTxForDb {
    return {
      creator: encoding.signer,
      safeAddress: encoding.safeAddress,
      txData: encoding.txDataHashParams,
      txDataHash: encoding.txDataHash,
      sigType,
      signature,
      network,
      meta: tx.getMeta(forTxSaver),
    };
  }

  async getEventData(receipt: TxReceipt, tx: TxWrapper, network: NetworkNumber): Promise<EventData> {
    const parser = this.env.config.hooks.parseReceiptEvents;
    if (!parser) return { recipeSwaps: [], fees: [] };
    try {
      return await parser(receipt, tx, network);
    } catch (err) {
      this.env.config.logger.captureException?.(err, { type: 'parseReceiptEvents', hash: receipt.transactionHash });
      return { recipeSwaps: [], fees: [] };
    }
  }

  revertedError(notificationId: string, initialTxHash: string, transactionHash: string, forkTxId?: string) {
    return new TxError('reverted', notificationId, initialTxHash, transactionHash, forkTxId, this.messages);
  }
}
