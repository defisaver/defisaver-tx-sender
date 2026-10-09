import type { AdditionalInfoData } from '../types';
import type {
  NotificationStatus,
  NotificationUpdate,
  TxConfirmBatchData,
  TxConfirmData,
  TxConfirmDataFromSignResolved,
  TxConfirmDataResolved,
  TxSignConfirmData,
} from '../types/confirm';
import type TxWrapper from '../TxWrapper';

export interface NotificationPayload {
  id: string;
  status: NotificationStatus;
  title: string;
  description: string;
  protocol: string;
  additionalInfo: AdditionalInfoData & {
    isTxSaverTx?: boolean;
    isMultiSigTx?: boolean;
    isMultiSigExec?: boolean;
    swapInjectInfo?: unknown;
  };
}

/**
 * User-facing surface: confirm dialogs and the notification list.
 * The SDK decides *when* and *what* to show; the app decides *how*.
 */
export interface UiAdapter {
  /** Stable id for a tx notification. The app's original scheme is `${notifications.length}-${tx.title}`. */
  createNotificationId(tx: TxWrapper): string;
  confirmSend(data: TxConfirmData): Promise<TxConfirmDataResolved>; // Resolve `false` when the user cancels.
  /** Resolve `false` when the user cancels, `true` to proceed with defaults. */
  confirmSign(data: TxSignConfirmData): Promise<TxConfirmDataFromSignResolved>;
  confirmBatch?(data: TxConfirmBatchData): Promise<boolean>; // Required only for `execute(..., { batch: true })`.
  /** Generic yes/no dialog. Used for the high gas price warning. Defaults to `true` when absent. */
  confirmDialog?(message: string): Promise<boolean>;
  addNotification(payload: NotificationPayload): void;
  changeNotification(id: string, changes: NotificationUpdate): void;
}
