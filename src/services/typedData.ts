import type { EIP712TypedData } from '../types';

export enum SignType {
  DelegationWithSig = 'DelegationWithSig',
  Permit = 'Permit',
  SafeTx = 'SafeTx',
  EIP712Domain = 'EIP712Domain',
  EIP712DomainSafe = 'EIP712DomainSafe',
  SetUserPositionManagers = 'SetUserPositionManagers',
  PositionManagerUpdate = 'PositionManagerUpdate',
  BorrowPermit = 'BorrowPermit',
  WithdrawPermit = 'WithdrawPermit',
  SetCanSetUsingAsCollateralPermissionPermit = 'SetCanSetUsingAsCollateralPermissionPermit',
  NonceMapping = 'NonceMapping',
  HyperliquidTransactionSendAsset = 'HyperliquidTransaction:SendAsset',
  HyperliquidTransactionWithdraw = 'HyperliquidTransaction:Withdraw',
}

type TypeFields = { name: string; type: string }[];

const RESERVE_PERMIT: TypeFields = [
  { name: 'spoke', type: 'address' },
  { name: 'reserveId', type: 'uint256' },
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
];

export const TYPED_SIGNATURE_TYPES: Record<string, TypeFields> = {
  [SignType.DelegationWithSig]: [
    { name: 'delegatee', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  [SignType.Permit]: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  [SignType.SafeTx]: [
    { type: 'address', name: 'to' },
    { type: 'uint256', name: 'value' },
    { type: 'bytes', name: 'data' },
    { type: 'uint8', name: 'operation' },
    { type: 'uint256', name: 'safeTxGas' },
    { type: 'uint256', name: 'baseGas' },
    { type: 'uint256', name: 'gasPrice' },
    { type: 'address', name: 'gasToken' },
    { type: 'address', name: 'refundReceiver' },
    { type: 'uint256', name: 'nonce' },
  ],
  [SignType.EIP712Domain]: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  [SignType.EIP712DomainSafe]: [
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  [SignType.BorrowPermit]: RESERVE_PERMIT,
  [SignType.WithdrawPermit]: RESERVE_PERMIT,
  [SignType.SetCanSetUsingAsCollateralPermissionPermit]: [
    { name: 'spoke', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'delegatee', type: 'address' },
    { name: 'status', type: 'bool' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  [SignType.SetUserPositionManagers]: [
    { name: 'onBehalfOf', type: 'address' },
    { name: 'updates', type: 'PositionManagerUpdate[]' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  [SignType.PositionManagerUpdate]: [
    { name: 'positionManager', type: 'address' },
    { name: 'approve', type: 'bool' },
  ],
  [SignType.NonceMapping]: [
    { name: 'chainId', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'depositor', type: 'address' },
    { name: 'id', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
  [SignType.HyperliquidTransactionSendAsset]: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'sourceDex', type: 'string' },
    { name: 'destinationDex', type: 'string' },
    { name: 'token', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'fromSubAccount', type: 'string' },
    { name: 'nonce', type: 'uint64' },
  ],
  [SignType.HyperliquidTransactionWithdraw]: [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
};

/** Extra struct types referenced by a primary type (e.g. `PositionManagerUpdate[]`). */
const NESTED_TYPES: Partial<Record<string, string[]>> = {
  [SignType.SetUserPositionManagers]: [SignType.PositionManagerUpdate],
};

export const buildTypedData = (
  primaryType: string,
  domainType: string,
  signatureInfo: Omit<EIP712TypedData, 'types'>,
): EIP712TypedData => {
  const types: EIP712TypedData['types'] = {
    EIP712Domain: TYPED_SIGNATURE_TYPES[domainType],
    [primaryType]: TYPED_SIGNATURE_TYPES[primaryType],
  };
  if (!types.EIP712Domain) throw new Error(`Unknown domain type ${domainType}`);
  if (!types[primaryType]) throw new Error(`Unknown primary type ${primaryType}`);
  (NESTED_TYPES[primaryType] || []).forEach((nested) => { types[nested] = TYPED_SIGNATURE_TYPES[nested]; });
  return { types, ...signatureInfo };
};
