import Dec from 'decimal.js';
import { assetAmountInWei, getAssetInfo } from '@defisaver/tokens';
import type { TxSaverData } from '@defisaver/sdk';
import { formatMessage } from '../../config/messages';
import { isMultisigSafeWallet } from '../../services/safe';
import { formatTxHash, wait } from '../../services/utils';
import { getProxyWalletByAddress } from '../../services/wallets';
import { type EthereumAddress, TxSaverStatus, type TxSaverStatusCheckApiReturnData } from '../../types';
import type { TxSaverConfirmationRet } from '../../types/confirm';
import type { EncoderSignRet, ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import TxError from '../TxError';
import { ExecutorBase } from './ExecutorBase';

/**
 * TxSaver: the user signs a Safe tx and DeFi Saver's relayer submits it, taking the gas fee
 * from the position. Entered either directly (pending multisig TxSaver tx) or by switching
 * from a normal send/sign flow when the user enables TxSaver in the confirm dialog.
 */
export default class SendTxSaverTxExecutor extends ExecutorBase {
  STATUS_CHECK_INTERVAL_MS = 5000;

  STATUS_CHECK_MAX_TRIES_COUNT = 100;

  DEADLINE_FROM_NOW_MS = 30 * 60 * 1000;

  GAS_ESTIMATE_BUFFER = 400_000; // Relayer adds its own overhead on top of the estimate.

  /** Executing a pending multisig TxSaver tx (last signature). */
  protected async executeInternal(context: ExecutionContext): Promise<ExecutionResult> {
    const {
      notifier, encoder, tx, txUtils, env,
    } = context;
    const { api, hooks } = env.config;

    const encoding = await encoder.encodeTx() as EncoderSignRet;
    const txSaverData = await this.getTxSaverData(context, encoding);
    await notifier.getConfirmationSign(encoding, txSaverData, true);
    notifier.addNotificationSign('Signing pending multisig TxSaver transaction', true, true, true);
    try {
      const signatureData = await txUtils.signSafeTx(
        encoding.txDataHash, encoding.txDataParams, env.network, encoding.signer, await tx.getExecutingAddressInTime(),
      );
      const signatures = tx.getPendingTxData()!.signatures.reduce<Record<string, string>>((acc, { signature, signer }) => {
        acc[signer] = signature;
        return acc;
      }, {});
      signatures[encoding.signer] = signatureData.signature;

      const txId = await api.submitTxToTxSaver(env.network, {
        eoa: encoding.signer,
        safe: encoding.safeAddress,
        data: encoding.txDataHashParams[2],
        title: tx.getTitle(),
        category: tx.getCategory(),
        message_hash: encoding.txDataHash,
        refund_receiver: encoding.txDataHashParams[8],
        signatures,
        gas_estimate: +new Dec(encoding.realGas).add(this.GAS_ESTIMATE_BUFFER).toFixed(0),
      });
      notifier.changeNotificationTxSaverSent('TxSaver is submitting your transaction, please wait...', txId);

      const txHash = (await this.checkTxStatus(context, txId)) || '';
      const { gasUsed, eventData } = await this.processReceipt(context, txHash);
      notifier.changeNotificationOnReceipt(formatMessage(env.config.messages.txConfirmed, { '%txHash': formatTxHash(txHash) }), gasUsed, eventData, '', txHash, txId);
      hooks.onTxMined?.(txHash, tx);
      return signatureData;
    } catch (e) {
      notifier.changeNotificationOnSignError('Error signing pending multisig transaction');
      throw e;
    }
  }

  /** Entered from SendNormalTxExecutor (1/1 Safe) or SignNewMultisigTxExecutor (first signature) when TxSaver is toggled on. */
  async executeWithConfirmation(context: ExecutionContext, txSaverConfirmation: TxSaverConfirmationRet): Promise<ExecutionResult> {
    const {
      notifier, encoder, tx, txUtils, env,
    } = context;
    const { api, hooks } = env.config;
    const executingAddress = await tx.getExecutingAddressInTime();
    const isMultisig = this.isMultisig(context, executingAddress);
    notifier.addNotificationSend('Waiting for user signature.', true, true);

    const {
      maxFee, feeToken, tokenPriceInEth, nonce,
    } = txSaverConfirmation;
    if (nonce) tx.setNonce(nonce);

    const txSaverRecipeData: TxSaverData = {
      deadline: this.getTxSaverDeadline(),
      maxTxCostInFeeToken: assetAmountInWei(maxFee, feeToken),
      shouldTakeFeeFromPosition: true,
      feeToken: getAssetInfo(feeToken).address,
      tokenPriceInEth: assetAmountInWei(tokenPriceInEth, 'ETH'),
    };
    const encoding = await encoder.encodeForTxSaver(executingAddress, txSaverRecipeData);
    const signatureData = await txUtils.signSafeTx(
      encoding.originalEncoding.txDataHash,
      encoding.originalEncoding.txDataParams,
      env.network,
      encoding.originalEncoding.signer,
      executingAddress,
    );

    if (isMultisig) {
      const multisigTx = txUtils.getMultisigTxForDb(tx, encoding.originalEncoding, signatureData.sigType, signatureData.signature, env.network, true);
      await api.postSafeTx(multisigTx, env.forkId);
      return signatureData;
    }

    const txId = await api.submitTxToTxSaver(env.network, {
      eoa: encoding.eoa,
      safe: encoding.safe,
      data: encoding.data,
      title: tx.getTitle(),
      category: tx.getCategory(),
      message_hash: encoding.message_hash,
      refund_receiver: encoding.refund_receiver,
      signatures: { [encoding.eoa]: signatureData.signature },
      gas_estimate: +new Dec(txSaverConfirmation.gasEstimate).add(this.GAS_ESTIMATE_BUFFER).toFixed(0),
    });
    notifier.changeNotificationTxSaverSent('TxSaver sent transaction, waiting for confirmation...', txId);

    const txHash = (await this.checkTxStatus(context, txId)) || '';
    const { gasUsed, eventData, receipt } = await this.processReceipt(context, txHash);
    notifier.changeNotificationOnReceipt(formatMessage(env.config.messages.txConfirmed, { '%txHash': formatTxHash(txHash) }), gasUsed, eventData, '', txHash, txId);
    hooks.onTxMined?.(txHash, tx);
    return receipt;
  }

  private async checkTxStatus(context: ExecutionContext, txId: number): Promise<string | undefined> {
    const { api } = context.env.config;
    let statusData: TxSaverStatusCheckApiReturnData;
    let tries = 0;
    for (;;) {
      statusData = await api.getTxSaverTxStatus(txId, context.env.network);
      if (statusData.status !== TxSaverStatus.IN_PROCESSING) break;
      if (++tries === this.STATUS_CHECK_MAX_TRIES_COUNT) {
        statusData.errorMsg = 'TxSaver transaction took too long to process.';
        break;
      }
      await wait(this.STATUS_CHECK_INTERVAL_MS);
    }
    if (statusData.status === TxSaverStatus.SUCCESSFUL) return statusData.txHash;
    throw new TxError(statusData.errorMsg || 'TxSaver transaction failed', context.notifier.getNotificationId(), statusData.txHash, statusData.txHash, undefined, context.env.config.messages);
  }

  private getTxSaverDeadline(): number {
    return Math.round((Date.now() + this.DEADLINE_FROM_NOW_MS) / 1000);
  }

  protected isMultisig(context: ExecutionContext, executingAddress: EthereumAddress): boolean {
    return isMultisigSafeWallet(getProxyWalletByAddress(context.env.config.state, executingAddress));
  }

  private async processReceipt(context: ExecutionContext, txHash: string) {
    const receipt = await context.env.config.chain.getTransactionReceipt(txHash);
    if (!receipt) throw new Error(`Receipt not found for ${txHash}`);
    const eventData = await context.txUtils.getEventData(receipt, context.tx, context.env.network);
    return { receipt, eventData, gasUsed: receipt.gasUsed };
  }
}
