import Dec from 'decimal.js';
import { formatMessage } from '../config/messages';
import { isLayer2Network, wait } from '../services/utils';
import type { EventData, TxSaverModalData } from '../types';
import type {
  NotificationUpdate,
  TxConfirmData,
  TxConfirmDataFromSignResolved,
  TxConfirmDataResolved,
  TxSignConfirmData,
} from '../types/confirm';
import type { EncoderSendRet, EncoderSignRet } from '../types/encoding';
import type TxWrapper from '../TxWrapper';
import type { Env } from './ExecutionContext';
import TxError from './TxError';

const HIGH_GAS_PRICE_GWEI = 500;

/** Drives the UI for a single tx: confirm dialogs and the notification state machine. Rendering is delegated to `UiAdapter`. */
export default class TxNotifier {
  private notificationId: string;

  constructor(private tx: TxWrapper, private env: Env) {
    this.notificationId = env.config.ui.createNotificationId(tx);
  }

  private get ui() { return this.env.config.ui; }

  private get messages() { return this.env.config.messages; }

  getNotificationId() {
    return this.notificationId;
  }

  private async shouldShowTxSaverToggle(txSaverData?: TxSaverModalData) {
    if (txSaverData === undefined) return false;
    const getPrice = this.env.config.hooks.getAssetPriceUsd;
    if (!getPrice) return true;
    try {
      const price = await getPrice(txSaverData.symbol, this.env.network);
      const totalSellUsd = new Dec(txSaverData.totalSellAmount).mul(price);
      const { minSellUsdL1 = 100, minSellUsdL2 = 10 } = this.env.config.txSaver || {};
      const minSell = isLayer2Network(this.env.network) ? minSellUsdL2 : minSellUsdL1;
      const show = totalSellUsd.greaterThanOrEqualTo(minSell);
      if (!show) this.env.config.logger.debug(`Not using TxSaver: totalSellUsd $${totalSellUsd.toString()} < $${minSell}`);
      return show;
    } catch (e) {
      this.env.config.logger.warn('Unable to show data for TxSaver', { error: (e as Error)?.message });
      return false;
    }
  }

  async getConfirmationSend(encoding: EncoderSendRet, txSaverData?: TxSaverModalData) {
    const confirmData: TxConfirmData = {
      from: encoding.txParams.from,
      to: encoding.txParams.to,
      data: encoding.txParams.data,
      value: encoding.txParams.value,
      failing: encoding.failing,
      insufficientFunds: encoding.insufficientFunds,
      realGas: encoding.realGas,
      gas: encoding.txParams.gas,
      title: this.tx.getTitle(),
      id: this.notificationId,
      protocol: this.tx.getProtocol(),
      isExactApproval: this.tx.getIsExactApproval(),
      showMevInfo: this.tx.getShowMevInfo(),
      showTxSaverToggle: await this.shouldShowTxSaverToggle(txSaverData),
      txSaverData,
      swapInjectInfo: this.tx.swapInjectInfo,
    };
    this.env.config.hooks.onTxPrompt?.(confirmData, encoding);

    const confirmation: TxConfirmDataResolved = await this.ui.confirmSend(confirmData);
    if (confirmation === false) throw new TxError(this.messages.userCanceled, this.notificationId, undefined, undefined, undefined, this.messages);
    if (confirmation.failed) return confirmation;
    if (!confirmation.isTxSaver && parseFloat(confirmation.gasPrice) > HIGH_GAS_PRICE_GWEI && this.ui.confirmDialog) {
      await wait(500);
      const confirmed = await this.ui.confirmDialog(formatMessage(this.messages.gasPriceVeryHigh, { '%gasPrice': confirmation.gasPrice }));
      if (!confirmed) throw new TxError(this.messages.userCanceled, this.notificationId, undefined, undefined, undefined, this.messages);
    }
    return confirmation;
  }

  async getConfirmationSign(
    encoding: EncoderSignRet,
    txSaverData?: TxSaverModalData,
    isSubmittingNewMultisigTx = false,
  ): Promise<Exclude<TxConfirmDataFromSignResolved, false>> {
    const confirmData: TxSignConfirmData = {
      failing: encoding.failing,
      realGas: encoding.realGas,
      gas: encoding.realGas,
      title: this.tx.getTitle(),
      id: this.notificationId,
      protocol: this.tx.getProtocol(),
      isExactApproval: this.tx.getIsExactApproval(),
      safeAddress: encoding.safeAddress,
      isSubmittingNewMultisigTx,
      showMevInfo: this.tx.getShowMevInfo(),
      showTxSaverToggle: txSaverData !== undefined,
      isTxSaverTx: this.tx.getIsTxSaver(),
      txSaverData,
      swapInjectInfo: this.tx.swapInjectInfo,
    };
    this.env.config.hooks.onTxPrompt?.(confirmData, encoding);

    const confirmation: TxConfirmDataFromSignResolved = await this.ui.confirmSign(confirmData);
    if (!confirmation) throw new TxError(this.messages.userCanceled, this.notificationId, undefined, undefined, undefined, this.messages);
    return confirmation;
  }

  /** `pending-sign` while waiting for the wallet, `pending` once a hash exists or while signing. */
  private addNotification(status: 'pending' | 'pending-sign', description: string, flags: { isTxSaverTx?: boolean; isMultiSigTx?: boolean; isMultiSigExec?: boolean }) {
    this.ui.addNotification({
      id: this.notificationId,
      status,
      title: this.tx.getTitle(),
      description,
      protocol: this.tx.getProtocol(),
      additionalInfo: { ...this.tx.getAdditionalInfo(), ...flags },
    });
  }

  addNotificationSign(description: string, isTxSaverTx = false, isMultiSigTx = false, isMultiSigExec = false) {
    this.addNotification('pending', description, { isTxSaverTx, isMultiSigTx, isMultiSigExec });
  }

  addNotificationSend(description: string, isTxSaverTx = false, isMultiSigTx = false, isMultiSigExec = false) {
    this.addNotification('pending-sign', description, { isTxSaverTx, isMultiSigTx, isMultiSigExec });
  }

  private notifyChange(changes: NotificationUpdate) {
    this.ui.changeNotification(this.notificationId, changes);
  }

  changeNotificationTxSaverSent(description: string, txSaverTxId: number) {
    this.notifyChange({
      status: 'pending', hidden: false, description, txSaverTxId,
    });
  }

  changeNotificationOnSignError(description: string) {
    this.notifyChange({ status: 'failed', hidden: false, description });
  }

  changeNotificationOnSignSuccess(description: string, showPending = true) {
    this.notifyChange({
      status: 'signed', showPending, hidden: false, network: this.env.network.toString(), description,
    });
  }

  changeNotificationOnTxHash(description: string, hash: string) {
    this.notifyChange({
      status: 'pending', hidden: false, description, hash,
    });
  }

  changeNotificationOnReceipt(description: string, gasUsed: number, eventData: EventData, forkTxId: string | undefined, hash: string, txId?: number) {
    this.notifyChange({
      status: 'confirmed',
      description,
      gasUsed,
      eventData,
      forkTxId,
      hash,
      network: this.env.network.toString(),
      txSaverTxId: txId,
      hidden: false,
    });
  }

  changeNotificationOnError(description: string, loadingDfeData: boolean, txTakingTooLong?: boolean, forkTxId?: string) {
    this.notifyChange({
      status: 'failed', description, loadingDfeData, txTakingTooLong, hidden: false, forkTxId,
    });
  }

  changeNotificationOnErrorOnDfeData(description: string, loadingDfeData: boolean, dfeData: unknown) {
    this.notifyChange({
      status: 'failed', hidden: false, description, loadingDfeData, dfeData,
    });
  }
}
