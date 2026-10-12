import { NetworkNumber, type EthereumAddress } from '../types';

export interface NetworkAddresses {
  safeSingleton130: EthereumAddress;
  safeProxyFactory130: EthereumAddress;
  safeFallbackHandler130: EthereumAddress;
  safeSimulateTxAccessor: EthereumAddress;
  multicall: EthereumAddress;
  dfsSafeFactory: EthereumAddress;
  feeRecipient: EthereumAddress; // `FeeRecipient.getFeeAddr()` tells where DFS service fees land.
  zeroXExchangeProxy: EthereumAddress;
}

const SAFE_SIMULATE_TX_ACCESSOR_141 = '0x3d4BA2E0884aa488718476ca2FB8Efc291A46199';
const ZERO_X_EXCHANGE_PROXY = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF';

export const DEFAULT_ADDRESSES: Record<NetworkNumber, NetworkAddresses> = {
  [NetworkNumber.Eth]: {
    safeSingleton130: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x1F98415757620B543A52E61c46B32eB19261F984',
    dfsSafeFactory: '0x905ade25b1f8f39cf470e39c5a768eaf1f91fd3e',
    feeRecipient: '0x39C4a92Dc506300c3Ea4c67ca4CA611102ee6F2A',
    zeroXExchangeProxy: ZERO_X_EXCHANGE_PROXY,
  },
  [NetworkNumber.Opt]: {
    safeSingleton130: '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    safeProxyFactory130: '0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC',
    safeFallbackHandler130: '0x017062a1dE2FE6b99BE3d9d37841FeD19F573804',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x1F98415757620B543A52E61c46B32eB19261F984',
    dfsSafeFactory: '0x28b6947c7f3cadcad6c5eaa07bb8b16896e44464',
    feeRecipient: '0x5b12C2B979CB3aB89DD4813837873bC4Dd1930D0',
    zeroXExchangeProxy: ZERO_X_EXCHANGE_PROXY,
  },
  [NetworkNumber.Base]: {
    safeSingleton130: '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    safeProxyFactory130: '0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC',
    safeFallbackHandler130: '0x017062a1dE2FE6b99BE3d9d37841FeD19F573804',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x091e99cb1C49331a94dD62755D168E941AbD0693',
    dfsSafeFactory: '0x3590d2be7f7a604a0496b00ded525eb8ae27ab5d',
    feeRecipient: '0xEDFc68e2874B0AFc0963e18AE4D68522aEc7f97D',
    zeroXExchangeProxy: ZERO_X_EXCHANGE_PROXY,
  },
  [NetworkNumber.Arb]: {
    safeSingleton130: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x1F98415757620B543A52E61c46B32eB19261F984',
    dfsSafeFactory: '0xeEdfce96C2D257a4c67b711998Bb65E32E288f66',
    feeRecipient: '0xe000e3c9428D539566259cCd89ed5fb85e655A01',
    zeroXExchangeProxy: ZERO_X_EXCHANGE_PROXY,
  },
  [NetworkNumber.Linea]: {
    safeSingleton130: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0xCd84Bff225760B6b8BAcF1e90e8409C25769EF52',
    dfsSafeFactory: '0x95a8665Ba58aa13A58c60B0803572772cda153dB',
    feeRecipient: '0x2226836ec16ff5974dfd8df740cd461b42faffd5',
    zeroXExchangeProxy: ZERO_X_EXCHANGE_PROXY,
  },
  [NetworkNumber.Plasma]: {
    safeSingleton130: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0xC2505e154666e0d551bEfd7fF446D43349E513A2',
    dfsSafeFactory: '0xdf92F1c22A4E114919B14bdb274071d5a55E3E58',
    feeRecipient: '0x4C0607dAD18c0DE19f6d7b25c0B0f1990818e9d7',
    zeroXExchangeProxy: ZERO_X_EXCHANGE_PROXY,
  },
  [NetworkNumber.Hyperliquid]: {
    safeSingleton130: '',
    safeProxyFactory130: '',
    safeFallbackHandler130: '',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '',
    dfsSafeFactory: '',
    feeRecipient: '',
    zeroXExchangeProxy: '',
  },
};

export type AddressOverrides = Partial<Record<NetworkNumber, Partial<NetworkAddresses>>>;

export const resolveAddresses = (network: NetworkNumber, overrides?: AddressOverrides): NetworkAddresses => ({
  ...DEFAULT_ADDRESSES[network],
  ...(overrides?.[network] || {}),
});
