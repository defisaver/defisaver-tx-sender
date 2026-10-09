import {
  encodePacked, getCreate2Address, keccak256, type Hex,
} from 'viem';
import type { ChainAdapter } from '../interfaces/ChainAdapter';
import { safeAbi, safeProxyFactoryAbi } from '../abi';
import {
  type AnyProxyWallet, type EthereumAddress, ProxyType, type SafeVersion, type SafeWallet,
} from '../types';
import { readContract } from './abi';

export const isSafeWallet = (wallet: AnyProxyWallet | undefined): wallet is SafeWallet => wallet?.type === ProxyType.Safe;

export const isMultisigSafeWallet = (wallet: AnyProxyWallet | undefined): wallet is SafeWallet => (
  isSafeWallet(wallet) && wallet.owners.length > 1
);

export const getDefaultSafeWalletObject = ({
  address, owners, threshold, version,
}: { address: string; owners: string[]; threshold: number; version: SafeVersion }): SafeWallet => ({
  type: ProxyType.Safe,
  address,
  owners,
  threshold,
  version,
  ethBalance: '0',
});

export const getNextSafeWalletNonce = async (chain: ChainAdapter, safeAddress: EthereumAddress) => {
  const nonce = await readContract<bigint>(chain, safeAddress, safeAbi, 'nonce');
  return Number(nonce);
};

/** CREATE2 address for `SafeProxyFactory.createProxyWithNonce(singleton, setupData, saltNonce)`. */
export const predictSafeAddress = async (
  chain: ChainAdapter,
  factoryAddress: EthereumAddress,
  singletonAddress: EthereumAddress,
  setupData: Hex,
  saltNonce: string,
) => {
  const proxyCreationCode = await readContract<Hex>(chain, factoryAddress, safeProxyFactoryAbi, 'proxyCreationCode');
  const initCode = `${proxyCreationCode}${singletonAddress.slice(2).padStart(64, '0')}` as Hex;
  const salt = keccak256(encodePacked(['bytes32', 'uint256'], [keccak256(setupData), BigInt(saltNonce)]));
  return getCreate2Address({
    from: factoryAddress as Hex,
    salt,
    bytecodeHash: keccak256(initCode),
  });
};
