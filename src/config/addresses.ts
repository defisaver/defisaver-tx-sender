import { NetworkNumber, type EthereumAddress } from '../types';

export interface NetworkAddresses {
  safeSingleton130: EthereumAddress;
  safeProxyFactory130: EthereumAddress;
  safeFallbackHandler130: EthereumAddress;
  safeSimulateTxAccessor: EthereumAddress;
  multicall: EthereumAddress;
  dfsSafeFactory: EthereumAddress;
}

const SAFE_SIMULATE_TX_ACCESSOR_141 = '0x3d4BA2E0884aa488718476ca2FB8Efc291A46199';

export const DEFAULT_ADDRESSES: Record<NetworkNumber, NetworkAddresses> = {
  [NetworkNumber.Eth]: {
    safeSingleton130: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x1F98415757620B543A52E61c46B32eB19261F984',
    dfsSafeFactory: '0x905ade25b1f8f39cf470e39c5a768eaf1f91fd3e',
  },
  [NetworkNumber.Opt]: {
    safeSingleton130: '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    safeProxyFactory130: '0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC',
    safeFallbackHandler130: '0x017062a1dE2FE6b99BE3d9d37841FeD19F573804',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x1F98415757620B543A52E61c46B32eB19261F984',
    dfsSafeFactory: '0x28b6947c7f3cadcad6c5eaa07bb8b16896e44464',
  },
  [NetworkNumber.Base]: {
    safeSingleton130: '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    safeProxyFactory130: '0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC',
    safeFallbackHandler130: '0x017062a1dE2FE6b99BE3d9d37841FeD19F573804',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x091e99cb1C49331a94dD62755D168E941AbD0693',
    dfsSafeFactory: '0x3590d2be7f7a604a0496b00ded525eb8ae27ab5d',
  },
  [NetworkNumber.Arb]: {
    safeSingleton130: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0x1F98415757620B543A52E61c46B32eB19261F984',
    dfsSafeFactory: '0xeEdfce96C2D257a4c67b711998Bb65E32E288f66',
  },
  [NetworkNumber.Linea]: {
    safeSingleton130: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0xCd84Bff225760B6b8BAcF1e90e8409C25769EF52',
    dfsSafeFactory: '0x95a8665Ba58aa13A58c60B0803572772cda153dB',
  },
  [NetworkNumber.Plasma]: {
    safeSingleton130: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
    safeProxyFactory130: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
    safeFallbackHandler130: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '0xC2505e154666e0d551bEfd7fF446D43349E513A2',
    dfsSafeFactory: '0xdf92F1c22A4E114919B14bdb274071d5a55E3E58',
  },
  [NetworkNumber.Hyperliquid]: {
    safeSingleton130: '',
    safeProxyFactory130: '',
    safeFallbackHandler130: '',
    safeSimulateTxAccessor: SAFE_SIMULATE_TX_ACCESSOR_141,
    multicall: '',
    dfsSafeFactory: '',
  },
};

export type AddressOverrides = Partial<Record<NetworkNumber, Partial<NetworkAddresses>>>;

export const resolveAddresses = (network: NetworkNumber, overrides?: AddressOverrides): NetworkAddresses => ({
  ...DEFAULT_ADDRESSES[network],
  ...(overrides?.[network] || {}),
});
