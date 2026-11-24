import { CHAIN_HEX, CHAIN_ID, RPC_URL, EXPLORER } from './ammora'

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found — install MetaMask and reload.')
  const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts?.[0]) throw new Error('Wallet returned no account.')
  await ensureGiwaChain()
  return accounts[0]
}

export async function ensureGiwaChain(): Promise<void> {
  if (!window.ethereum) throw new Error('No wallet found.')
  const current = (await window.ethereum.request({ method: 'eth_chainId' })) as string
  if (current?.toLowerCase() === CHAIN_HEX) return
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }],
    })
  } catch {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: 'GIWA Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    })
  }
  const after = (await window.ethereum.request({ method: 'eth_chainId' })) as string
  if (after?.toLowerCase() !== CHAIN_HEX) {
    throw new Error(`Please switch your wallet to GIWA Sepolia (chain ${CHAIN_ID}).`)
  }
}

/** Ask the wallet to sign/send a prepared call. Only ever called after an explicit user click. */
export async function sendPreparedCall(from: string, to: string, data: string): Promise<string> {
  if (!window.ethereum) throw new Error('No wallet found.')
  await ensureGiwaChain()
  const txHash = (await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from, to, data }],
  })) as string
  return txHash
}
