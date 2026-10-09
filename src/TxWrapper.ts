import { Recipe } from '@defisaver/sdk';
import { assetAmountInEth, getAssetInfoByAddress } from '@defisaver/tokens';
import type { SignType } from './services/typedData';
import {
  type AdditionalInfoData,
  type ApproveData,
  type ContractCallParams,
  type EthereumAddress,
  type MultisigTxMeta,
  type PendingTxData,
  type RawTxCallParams,
  type RecipeBuilder,
  type ShowMevInfoData,
  type SwapInjectInfo,
  type TxOnBehalf,
  type TxReceipt,
  type TxSaverMeta,
  TxType,
  type TxWParam,
} from './types';

type ExecuteBeginHook = () => unknown | Promise<unknown>;
type ExecuteSuccessHook = (receipt: TxReceipt) => unknown | Promise<unknown>;
type ExecuteErrorHook = (error: Error) => unknown | Promise<unknown>;

export interface TxWrapperOptions {
  protocol?: string;
  additionalInfo?: AdditionalInfoData;
  title?: string;
  category?: string;
  executingAddress?: TxWParam<EthereumAddress>;
  ethValue?: string;
  minGas?: number;
  extraGas?: number;
  isExactApproval?: boolean;
  forceExecuteAsRecipe?: boolean;
  notifMessage?: string;
  checkReturnValue?: boolean;
  returnValueFailureMessage?: string;
  approveData?: TxWParam<ApproveData>;
  contractCallParams?: ContractCallParams;
  pendingTxData?: PendingTxData;
  showMevInfo?: ShowMevInfoData;
  rawTxCallParams?: RawTxCallParams;
  onTxHashCallback?: (txHash: string) => void;
  recipe?: RecipeBuilder;
  onExecuteBegin?: ExecuteBeginHook;
  onExecuteSuccess?: ExecuteSuccessHook;
  onExecuteError?: ExecuteErrorHook;
  isTimeSensitive?: boolean;
  signaturePrimaryType?: SignType;
  signatureDomainType?: SignType;
  signatureInfo?: unknown;
  enableTxSaver?: boolean;
  nonce?: number;
  shouldCheckEstimate?: boolean;
  swapSourcesBlacklist?: string[];
  swapInjectInfo?: SwapInjectInfo;
  swapOrders?: unknown[];
  isBatch?: boolean;
  onBehalf?: TxOnBehalf;
  method?: string;
  addSuffix?: boolean;
}

/** Describes one transaction (or signature) to be executed by `TxSender`. Mutable builder with getters/setters. */
export default class TxWrapper {
  executingAddress: TxWParam<EthereumAddress>;

  type: TxType;

  protocol: string;

  additionalInfo: AdditionalInfoData;

  title: string;

  category: string;

  recipe: RecipeBuilder;

  executedRecipe?: Recipe;

  contractCall: ContractCallParams | null;

  method: string;

  methodParams: TxWParam<unknown[]>;

  ethValue: string;

  minGas: number;

  extraGas: number;

  isExactApproval: boolean;

  forceExecuteAsRecipe: boolean;

  onTxHashCallback: (txHash: string) => void;

  notifMessage: string;

  checkReturnValue: boolean;

  returnValueFailureMessage: string;

  approveData?: TxWParam<ApproveData>;

  pendingTxData?: PendingTxData;

  showMevInfo: ShowMevInfoData;

  rawTxCallParams?: RawTxCallParams;

  onExecuteBegin: ExecuteBeginHook;

  onExecuteSuccess: ExecuteSuccessHook;

  onExecuteError: ExecuteErrorHook;

  isTimeSensitive: boolean;

  signaturePrimaryType?: SignType;

  signatureDomainType?: SignType;

  signatureInfo: unknown;

  enableTxSaver: boolean;

  txSaverTxId?: number;

  nonce?: number;

  id?: number;

  shouldCheckEstimate: boolean;

  swapSourcesBlacklist: string[] = [];

  swapOrders: unknown[];

  swapInjectInfo?: SwapInjectInfo | null;

  isBatch?: boolean;

  onBehalf?: TxOnBehalf;

  addSuffix?: boolean;

  constructor(type: TxType, additional: TxWrapperOptions = {}) {
    if (!type) throw new Error('TxWrapper: type is required');
    this.type = type;
    this.executingAddress = additional.executingAddress || '';
    this.protocol = additional.protocol || '';
    this.additionalInfo = additional.additionalInfo || {};
    this.title = additional.title || '';
    this.category = additional.category || '';
    this.recipe = additional.recipe || (async () => new Recipe('empty'));
    this.contractCall = null;
    this.method = additional.method || '';
    this.methodParams = [];
    this.ethValue = additional.ethValue || '0';
    this.minGas = additional.minGas || 0;
    this.extraGas = additional.extraGas || 0;
    this.isExactApproval = additional.isExactApproval || false;
    this.forceExecuteAsRecipe = additional.forceExecuteAsRecipe || false;
    this.onTxHashCallback = additional.onTxHashCallback || (() => {});
    this.notifMessage = additional.notifMessage || '';
    this.checkReturnValue = additional.checkReturnValue || false;
    this.returnValueFailureMessage = additional.returnValueFailureMessage || '';
    this.approveData = additional.approveData;
    this.pendingTxData = additional.pendingTxData;
    if (additional.contractCallParams) this.setContractCallParams(additional.contractCallParams);
    this.showMevInfo = additional.showMevInfo || ({} as ShowMevInfoData);
    if (type === TxType.Raw && !additional.rawTxCallParams) {
      throw new Error('TxType on TxWrapper is set to: Raw, but rawTxCallParams are not set correctly.');
    }
    this.rawTxCallParams = additional.rawTxCallParams;
    this.onExecuteBegin = additional.onExecuteBegin || (async () => {});
    this.onExecuteSuccess = additional.onExecuteSuccess || (async () => {});
    this.onExecuteError = additional.onExecuteError || (async () => {});
    this.isTimeSensitive = additional.isTimeSensitive || false;
    if (type === TxType.TypedSignature) {
      if (!additional.signaturePrimaryType) throw new Error('TxType on TxWrapper is set to: TypedSignature, but signaturePrimaryType is not set correctly.');
      if (!additional.signatureDomainType) throw new Error('TxType on TxWrapper is set to: TypedSignature, but signatureDomainType is not set correctly.');
      if (!additional.signatureInfo) throw new Error('TxType on TxWrapper is set to: TypedSignature, but signatureInfo is not set correctly.');
    }
    this.signaturePrimaryType = additional.signaturePrimaryType;
    this.signatureDomainType = additional.signatureDomainType;
    this.signatureInfo = additional.signatureInfo;
    this.enableTxSaver = additional.enableTxSaver || false;
    this.shouldCheckEstimate = additional.shouldCheckEstimate || false;
    this.swapSourcesBlacklist = additional.swapSourcesBlacklist || [];
    this.swapInjectInfo = additional.swapInjectInfo || null;
    this.swapOrders = additional.swapOrders || [];
    if (additional.nonce) this.nonce = additional.nonce;
    this.isBatch = additional.isBatch || false;
    this.onBehalf = additional.onBehalf;
    this.addSuffix = additional.addSuffix ?? false;
  }

  setProtocol(protocol: string) { this.protocol = protocol; }

  setAdditionalInfo(additionalInfo: AdditionalInfoData) { this.additionalInfo = additionalInfo; }

  setTitle(title: string) { this.title = title; }

  setCategory(category: string) { this.category = category; }

  setRecipe(recipe: RecipeBuilder) { this.recipe = recipe; }

  setContractCallParams(callParams: ContractCallParams) {
    this.contractCall = callParams;
    this.method = callParams.method;
    this.methodParams = callParams.methodParams || [];
    if (callParams.ethValue) this.setEthValue(callParams.ethValue);
  }

  setExecutingAddress(executingAddress: TxWParam<EthereumAddress>) { this.executingAddress = executingAddress; }

  setEthValue(ethValue: string) { this.ethValue = ethValue; }

  setMinGas(minGas: number) { this.minGas = minGas; }

  setExtraGas(extraGas: number) { this.extraGas = extraGas; }

  setIsExactApproval(isExactApproval: boolean) { this.isExactApproval = isExactApproval; }

  setForceExecuteAsRecipe(forceExecuteAsRecipe: boolean) { this.forceExecuteAsRecipe = forceExecuteAsRecipe; }

  setOnTxHashCallback(onTxHashCallback: (txHash: string) => void) { this.onTxHashCallback = onTxHashCallback; }

  setNotifMessage(notifMessage: string) { this.notifMessage = notifMessage; }

  setCheckReturnValue(checkReturnValue: boolean) { this.checkReturnValue = checkReturnValue; }

  setReturnValueFailureMessage(message: string) { this.returnValueFailureMessage = message; }

  setType(type: TxType) { this.type = type; }

  setApproveData(approveData: TxWParam<ApproveData>) { this.approveData = approveData; }

  setShowMevInfo(showMevInfo: ShowMevInfoData) { this.showMevInfo = showMevInfo; }

  setOnExecuteBegin(hook: ExecuteBeginHook) { this.onExecuteBegin = hook; }

  setOnExecuteSuccess(hook: ExecuteSuccessHook) { this.onExecuteSuccess = hook; }

  setOnExecuteError(hook: ExecuteErrorHook) { this.onExecuteError = hook; }

  setSignaturePrimaryType(type: SignType) { this.signaturePrimaryType = type; }

  setSignatureDomainType(type: SignType) { this.signatureDomainType = type; }

  setSignatureInfo(signatureInfo: unknown) { this.signatureInfo = signatureInfo; }

  setOnBehalf(onBehalf: TxOnBehalf) { this.onBehalf = onBehalf; }

  setIsTimeSensitive(timeSensitive: boolean) { this.isTimeSensitive = timeSensitive; }

  setNonce(nonce: number) { this.nonce = nonce; }

  setIsBatch(isBatch: boolean) { this.isBatch = isBatch; }

  setExecutedRecipe(recipe: Recipe) { this.executedRecipe = recipe; }

  getSignatureInfo() { return this.signatureInfo; }

  getSignaturePrimaryType() { return this.signaturePrimaryType; }

  getSignatureDomainType() { return this.signatureDomainType; }

  getProtocol() { return this.protocol; }

  getTitle() { return this.title; }

  getCategory() { return this.category; }

  getRecipe() { return this.recipe; }

  getContractCall() { return this.contractCall; }

  getMethod() { return this.method; }

  getMethodParams() { return this.methodParams; }

  getExecutingAddress() { return this.executingAddress; }

  getEthValue() { return this.ethValue; }

  getMinGas() { return this.minGas; }

  getExtraGas() { return this.extraGas; }

  getIsExactApproval() { return this.isExactApproval; }

  getForceExecuteAsRecipe() { return this.forceExecuteAsRecipe; }

  getOnTxHashCallback() { return this.onTxHashCallback; }

  getNotifMessage() { return this.notifMessage; }

  getCheckReturnValue() { return this.checkReturnValue; }

  getReturnValueFailureMessage() { return this.returnValueFailureMessage; }

  getType() { return this.type; }

  getApproveData() { return this.approveData; }

  getOnBehalf() { return this.onBehalf; }

  getIsTimeSensitive() { return this.isTimeSensitive; }

  getPendingTxData() { return this.pendingTxData; }

  getIsBatch() { return !!this.isBatch; }

  getAdditionalInfo() {
    return { ...this.additionalInfo, swapInjectInfo: this.swapInjectInfo };
  }

  getShowMevInfo(): ShowMevInfoData {
    // Many callers still place showMevInfo inside additionalInfo; prefer it when set.
    const fromInfo = (this.additionalInfo as { showMevInfo?: ShowMevInfoData }).showMevInfo;
    if (fromInfo?.shouldShowMev) return fromInfo;
    return this.showMevInfo;
  }

  async getExecutingAddressInTime(): Promise<EthereumAddress> {
    if (typeof this.executingAddress === 'function') return this.executingAddress();
    return this.executingAddress;
  }

  async getMethodParamsInTime(): Promise<unknown[]> {
    if (typeof this.methodParams === 'function') return this.methodParams();
    return this.methodParams;
  }

  async getApproveDataInTime(): Promise<ApproveData | undefined> {
    if (typeof this.approveData === 'function') return this.approveData();
    return this.approveData;
  }

  getContractAddress(): EthereumAddress {
    if (this.type === TxType.Raw) return this.rawTxCallParams!.to;
    if (!this.contractCall) throw new Error('TxWrapper: contractCallParams are not set');
    return this.contractCall.address;
  }

  getHasSwap() {
    return this.getRecipeSwaps().length > 0;
  }

  getRecipeSwaps() {
    try {
      return this.getExecutedRecipe().getSwapActions();
    } catch {
      return [];
    }
  }

  getIsTxSaver(): boolean {
    return !!this.pendingTxData?.txSaverMeta;
  }

  getTxSaverMeta(): TxSaverMeta | undefined {
    if (!this.enableTxSaver) return undefined;
    if (this.pendingTxData?.txSaverMeta) return this.pendingTxData.txSaverMeta;
    try {
      const orderData = this.getExecutedRecipe().getTxSaverOrderData();
      if (/\$\d+/.test(orderData.fromAmount)) {
        throw new Error('TxSaver order data error: Only recipes with fixed amount of sell asset are supported for taking fee from position.');
      }
      const fromAsset = getAssetInfoByAddress(orderData.fromAsset).symbol;
      return {
        fromAsset,
        fromAmount: assetAmountInEth(orderData.fromAmount, fromAsset),
        toAsset: getAssetInfoByAddress(orderData.toAsset).symbol,
      };
    } catch {
      return undefined;
    }
  }

  getMeta(forTxSaver: boolean): MultisigTxMeta {
    return {
      title: this.title,
      category: this.category,
      protocol: this.protocol,
      additionalInfo: this.additionalInfo,
      minGas: this.minGas,
      extraGas: this.extraGas,
      hasSwap: this.getHasSwap(),
      isTimeSensitive: this.getIsTimeSensitive(),
      txSaverMeta: forTxSaver ? this.getTxSaverMeta() : undefined,
    };
  }

  /** Throws when the recipe has not been built yet. */
  getExecutedRecipe(): Recipe {
    if (this.executedRecipe === undefined) throw new Error('Executed recipe is not set');
    return this.executedRecipe;
  }

  getRecipeWithChecks(): Promise<Recipe> | Recipe {
    if (this.executedRecipe === undefined) return this.recipe(this.swapSourcesBlacklist, this.swapOrders);
    return this.executedRecipe;
  }

  addSwapSourceToBlacklist(source: string) {
    this.swapSourcesBlacklist.push(source);
  }
}
