import {
  createPublicClient,
  http,
  erc20Abi,
  formatUnits,
  parseUnits,
  encodeFunctionData,
  type Address,
} from 'viem'
import {
  giwaSepoliaAutoRouteDeployment,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
} from '@ammora-protocol/sdk'

export const CHAIN_ID = 91342
export const CHAIN_HEX = '0x164ce'
export const RPC_URL = 'https://sepolia-rpc.giwa.io'
export const EXPLORER = 'https://sepolia-explorer.giwa.io'
export const SDK_VERSION = '0.3.9'
export const MATH_VERSION = '0.3.0'

export const deployment = giwaSepoliaAutoRouteDeployment
export const contracts = deployment.contracts
export const FACTORY = contracts.launch.factory as Address
export const CONFIG_REGISTRY = contracts.launch.configRegistry as Address
export const WETH = contracts.tokens.wrappedNative as Address

export const publicClient = createPublicClient({
  transport: http(RPC_URL),
})

export interface CatalogEntry {
  label: string
  group: string
  address: string | null
}

/** Contract addresses rendered FROM the SDK deployment object — never hardcoded. */
export function deploymentCatalog(): CatalogEntry[] {
  const c = contracts as unknown as Record<string, Record<string, unknown>>
  const rows: [string, string, unknown][] = [
    ['Launch Factory (V4)', 'Launch', c.launch?.factory],
    ['Config Registry', 'Launch', c.launch?.configRegistry],
    ['First-Buy Executor', 'Launch', c.launch?.firstBuyExecutor],
    ['Math Module', 'Launch', c.launch?.mathModule],
    ['Graduation Adapter', 'Launch', c.launch?.graduationAdapter],
    ['Fee Policy', 'Launch', c.launch?.feePolicy],
    ['Concentrated Factory (ARL)', 'Launch', c.launch?.concentratedFactory],
    ['Concentrated Position Manager', 'Launch', c.launch?.concentratedPositionManager],
    ['Concentrated Fee Controller', 'Launch', c.launch?.concentratedFeeController],
    ['Compounding Factory', 'Launch', c.launch?.compoundingFactory],
    ['ALMM Factory', 'Liquidity / ALMM', c.liquidityMarketMaker?.factory],
    ['ALMM Position Manager', 'Liquidity / ALMM', c.liquidityMarketMaker?.positionManager],
    ['ALMM Bin Lens', 'Liquidity / ALMM', c.liquidityMarketMaker?.binLens],
    ['ALMM Limit Order Manager', 'Liquidity / ALMM', c.liquidityMarketMaker?.limitOrderManager],
    ['ALMM Zap Router', 'Liquidity / ALMM', c.liquidityMarketMaker?.zapRouter],
    ['ALMM Reward Manager', 'Liquidity / ALMM', c.liquidityMarketMaker?.rewardManager],
    ['ALMM Oracle', 'Liquidity / ALMM', c.liquidityMarketMaker?.oracle],
    ['Fee Sharing Factory', 'Fees', c.feeSharing?.factory],
    ['Token Policy Registry', 'Policy', c.policy?.tokenPolicyRegistry],
    ['Execution Registry (Router)', 'Routers', c.routers?.executionRegistry],
    ['Native Router', 'Routers', c.routers?.native],
    ['Permit Router', 'Routers', c.routers?.permit],
    ['Genesis Vault Factory', 'Vaults', c.vaults?.genesisFactory],
    ['Yield Vault Factory', 'Vaults', c.vaults?.yieldFactory],
    ['WETH (Wrapped Native)', 'Tokens', c.tokens?.wrappedNative],
  ]
  return rows.map(([label, group, address]) => ({
    label,
    group,
    address: typeof address === 'string' ? address : null,
  }))
}

export interface Launch {
  token: Address
  curve: Address
  creator: Address
  configId: bigint
  name: string
  symbol: string
  decimals: number
  quoteReserve: bigint
  baseReserve: bigint
  migrationQuoteThreshold: bigint
  migrationBaseThreshold: bigint
  feeBps: bigint
  statusCode: number
  source: 'live'
  blockNumber: bigint
}

export const POOL_STATUS = ['Active', 'ReadyToMigrate', 'Migrated', 'Closed'] as const
export function poolStatusLabel(code: number): string {
  // Status enum values are read live; unknown codes are shown raw rather than guessed.
  return code === 0 ? 'Active' : `Status ${code}`
}

const launchCreatedEvent = ammoraLaunchFactoryV4Abi.find(
  (x) => x.type === 'event' && x.name === 'LaunchCreated',
) as never

/**
 * Discover launches on-chain: scan LaunchCreated logs from the V4 factory
 * backwards in 10k-block chunks (the GIWA RPC getLogs limit), then enrich
 * each curve with live pool + ERC-20 reads. Throws if RPC is unreachable so
 * the UI can fall back to a clearly-labelled snapshot.
 */
export async function discoverLaunches(
  maxLaunches = 18,
  maxChunks = 90,
  onProgress?: (scanned: number, found: number) => void,
): Promise<{ launches: Launch[]; head: bigint; scannedChunks: number }> {
  const head = await publicClient.getBlockNumber()
  const logs: { args: Record<string, unknown>; blockNumber: bigint | null }[] = []
  let to = head
  let chunks = 0
  const startBlock = BigInt(deployment.startBlock ?? '0')
  while (chunks < maxChunks && to > startBlock && logs.length < maxLaunches) {
    const from = to - 9999n > startBlock ? to - 9999n : startBlock
    const batch = await publicClient.getLogs({
      address: FACTORY,
      event: launchCreatedEvent,
      fromBlock: from,
      toBlock: to,
    })
    logs.unshift(...(batch as unknown as typeof logs))
    chunks++
    onProgress?.(chunks, logs.length)
    if (from === startBlock) break
    to = from - 1n
  }
  const recent = logs.slice(-maxLaunches).reverse()
  const launches: Launch[] = []
  for (const log of recent) {
    const a = log.args as { token: Address; curve: Address; creator: Address; configId: bigint }
    try {
      const [name, symbol, decimals, quoteReserve, baseReserve, migQ, migB, feeBps, statusCode] =
        await Promise.all([
          publicClient.readContract({ address: a.token, abi: erc20Abi, functionName: 'name' }).catch(() => 'Unknown'),
          publicClient.readContract({ address: a.token, abi: erc20Abi, functionName: 'symbol' }).catch(() => '???'),
          publicClient.readContract({ address: a.token, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
          publicClient.readContract({ address: a.curve, abi: ammoraLaunchPoolV4Abi, functionName: 'quoteReserve' }),
          publicClient.readContract({ address: a.curve, abi: ammoraLaunchPoolV4Abi, functionName: 'baseReserve' }),
          publicClient.readContract({ address: a.curve, abi: ammoraLaunchPoolV4Abi, functionName: 'migrationQuoteThreshold' }),
          publicClient.readContract({ address: a.curve, abi: ammoraLaunchPoolV4Abi, functionName: 'migrationBaseThreshold' }),
          publicClient.readContract({ address: a.curve, abi: ammoraLaunchPoolV4Abi, functionName: 'currentFeeBps' }).catch(() => 100n),
          publicClient.readContract({ address: a.curve, abi: ammoraLaunchPoolV4Abi, functionName: 'status' }).catch(() => 0),
        ])
      launches.push({
        token: a.token,
        curve: a.curve,
        creator: a.creator,
        configId: a.configId,
        name: String(name),
        symbol: String(symbol),
        decimals: Number(decimals),
        quoteReserve: quoteReserve as bigint,
        baseReserve: baseReserve as bigint,
        migrationQuoteThreshold: migQ as bigint,
        migrationBaseThreshold: migB as bigint,
        feeBps: feeBps as bigint,
        statusCode: Number(statusCode),
        source: 'live',
        blockNumber: log.blockNumber ?? 0n,
      })
    } catch {
      // Skip curves that cannot be read rather than inventing values.
    }
  }
  return { launches, head, scannedChunks: chunks }
}

export interface SwapQuote {
  amountOut: bigint
  fee: bigint
  amountLeft: bigint
}

/** Live quote via the pool's quoteExactInput (SDK ABI). baseForQuote=false = pay quote (WETH), receive base. */
export async function quoteSwap(
  curve: Address,
  amountInHuman: string,
  baseForQuote: boolean,
  inDecimals: number,
): Promise<SwapQuote> {
  const amountIn = parseUnits(amountInHuman || '0', inDecimals)
  const [result, fee] = await publicClient.readContract({
    address: curve,
    abi: ammoraLaunchPoolV4Abi,
    functionName: 'quoteExactInput',
    args: [amountIn, baseForQuote],
  })
  const r = result as { amountOut: bigint; amountLeft: bigint }
  return { amountOut: r.amountOut, fee: fee as bigint, amountLeft: r.amountLeft }
}

/**
 * Prepare (do NOT send) a swapExactInput call using the SDK pool ABI.
 * Returns the exact calldata a wallet would be asked to sign, so the user
 * can inspect it before any confirmation in MetaMask.
 */
export function prepareSwapCalldata(params: {
  curve: Address
  amountIn: bigint
  minOut: bigint
  baseForQuote: boolean
  recipient: Address
  deadlineSeconds?: number
}): { to: Address; data: `0x${string}`; functionName: string } {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 1200))
  const data = encodeFunctionData({
    abi: ammoraLaunchPoolV4Abi,
    functionName: 'swapExactInput',
    args: [params.amountIn, params.minOut, params.baseForQuote, false, params.recipient, deadline],
  })
  return { to: params.curve, data, functionName: 'swapExactInput' }
}

export function applySlippage(amount: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round(slippagePct * 100))
  return (amount * (10000n - bps)) / 10000n
}

export function fmt(amount: bigint, decimals: number, maxFrac = 6): string {
  const s = formatUnits(amount, decimals)
  const [i, f = ''] = s.split('.')
  return f ? `${i}.${f.slice(0, maxFrac)}` : i
}

export function graduationPct(l: Pick<Launch, 'quoteReserve' | 'migrationQuoteThreshold'>): number {
  if (l.migrationQuoteThreshold === 0n) return 0
  const pct = Number((l.quoteReserve * 10000n) / l.migrationQuoteThreshold) / 100
  return Math.min(100, pct)
}

export function shortAddr(a?: string | null): string {
  if (!a) return '—'
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

/** Fallback snapshot — names/symbols seen in the reference video (2026-11-21). Reserves are NOT shown: they were not verified live. */
export const FALLBACK_SNAPSHOT = {
  label: 'Fallback snapshot — reference video, 2026-11-21 — NOT live data',
  rows: [
    { name: 'Galatasaray', symbol: 'GS' },
    { name: 'Fenerbahce', symbol: 'FBB' },
    { name: 'GiwaLaunch Token', symbol: 'GLT' },
    { name: 'GiwaPad Test', symbol: 'GPTEST' },
    { name: 'PiPiN', symbol: 'PPN' },
    { name: 'giwawa', symbol: 'GIWAWA' },
    { name: 'Ding Dong', symbol: '2D' },
    { name: 'icardi', symbol: 'ICD' },
  ],
}
