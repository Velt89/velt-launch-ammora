import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseUnits, formatUnits, type Address } from 'viem'
import {
  CHAIN_ID, RPC_URL, EXPLORER, SDK_VERSION, MATH_VERSION, WETH, FACTORY, CONFIG_REGISTRY,
  deployment, deploymentCatalog, discoverLaunches, quoteSwap, prepareSwapCalldata,
  applySlippage, fmt, graduationPct, poolStatusLabel, shortAddr, FALLBACK_SNAPSHOT,
  type Launch,
} from './lib/ammora'
import { connectWallet, sendPreparedCall } from './lib/wallet'

const BLOCKED_CONFIG = 6n
const REUSE_CONFIG = 10n
const REGISTRY_FROM_TASK = '0x6d043014972b87406C4757a5f2d655A24e0b0aF9'

export default function App() {
  const [wallet, setWallet] = useState<string>('')
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState<'explorer' | 'swap' | 'studio' | 'dashboard' | 'catalog'>('explorer')

  const [launches, setLaunches] = useState<Launch[]>([])
  const [liveState, setLiveState] = useState<'idle' | 'loading' | 'live' | 'fallback'>('idle')
  const [liveNote, setLiveNote] = useState('')
  const [selectedCurve, setSelectedCurve] = useState<string>('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = useCallback(async () => {
    setLiveState('loading'); setLiveNote('Scanning LaunchCreated logs from the V4 factory…')
    try {
      const { launches: found, head, scannedChunks } = await discoverLaunches(18, 90, (c, f) =>
        setLiveNote(`Scanning… ${c} chunks of 10k blocks, ${f} launches found`))
      if (found.length === 0) throw new Error('No launches found in scanned range')
      setLaunches(found); setLiveState('live')
      setLiveNote(`Live from GIWA RPC — head block ${head.toString()}, scanned ${scannedChunks} chunks, ${found.length} launches enriched with live pool reads.`)
      setSelectedCurve((prev) => prev || found[0].curve)
    } catch (e) {
      setLiveState('fallback')
      setLiveNote(`Live RPC read failed (${e instanceof Error ? e.message.slice(0, 140) : 'unknown error'}). Showing the labelled fallback snapshot below — no reserves are presented as live.`)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const selected = useMemo(() => launches.find((l) => l.curve === selectedCurve) ?? launches[0], [launches, selectedCurve])
  const catalog = useMemo(() => deploymentCatalog(), [])

  async function onConnect() {
    try { const a = await connectWallet(); setWallet(a); showToast(`Connected ${shortAddr(a)} on GIWA Sepolia`) }
    catch (e) { showToast(e instanceof Error ? e.message : 'Connect failed') }
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo">V</div>
          <div>
            <h1>Velt Launch — Ammora Launchpad + Exchange</h1>
            <div className="sub">Launch, trade &amp; graduate tokens on GIWA Sepolia · SDK {SDK_VERSION} · auto-route V4 · concentrated graduation</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge">Chain {CHAIN_ID}</span>
          <span className="badge warn">TESTNET ONLY</span>
          {wallet ? <span className="badge good">{shortAddr(wallet)}</span> :
            <button className="btn" onClick={onConnect}>Connect MetaMask</button>}
        </div>
      </header>

      <div className="alert" style={{ margin: '10px 0 16px' }}>
        <b>Beta / pre-audit testnet software.</b> GIWA Sepolia only — no mainnet deployment, no independent audit completed, test assets have no real value. This app never asks for a seed phrase or private key; every transaction is confirmed by you in MetaMask. Quotes and plans are prepared locally / read live — <b>no transaction is sent unless you click a confirm button and sign in your wallet.</b>
      </div>

      <nav className="tabs">
        {([['explorer', '🚀 Live Launches'], ['swap', '⇄ Exchange / Swap'], ['studio', '🛠 Launch Studio'], ['dashboard', '◈ Creator Dashboard'], ['catalog', '▦ SDK Catalog']] as const).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
        <button className="tab" onClick={() => void load()}>↻ Refresh live reads</button>
      </nav>

      {tab === 'explorer' && (
        <section className="card">
          <h2>Live launches — discovered on-chain</h2>
          <p className="small">{liveNote || '—'}</p>
          {liveState === 'live' && (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Token</th><th>Config</th><th>Curve</th><th>Status</th><th>WETH reserve</th><th>Graduation</th></tr></thead>
                <tbody>
                  {launches.map((l) => (
                    <tr key={l.curve} className={`clickable ${selected?.curve === l.curve ? 'selected' : ''}`} onClick={() => { setSelectedCurve(l.curve); setTab('swap') }}>
                      <td><b>{l.name}</b> <span className="badge">{l.symbol}</span><br /><span className="small mono">{shortAddr(l.token)}</span></td>
                      <td>#{l.configId.toString()}</td>
                      <td className="mono">{shortAddr(l.curve)}</td>
                      <td>{poolStatusLabel(l.statusCode)}</td>
                      <td>{fmt(l.quoteReserve, 18)} WETH</td>
                      <td style={{ minWidth: 130 }}>{graduationPct(l).toFixed(1)}%<div className="bar"><i style={{ width: `${graduationPct(l)}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {liveState === 'loading' && <p>Loading live launches…</p>}
          {liveState === 'fallback' && (
            <>
              <div className="alert bad">{FALLBACK_SNAPSHOT.label}. Token names/symbols only — reserves, status and graduation are intentionally not shown because they were not verified live in this session.</div>
              <table><thead><tr><th>Token</th><th>Symbol</th><th>Source</th></tr></thead>
                <tbody>{FALLBACK_SNAPSHOT.rows.map((r) => <tr key={r.symbol}><td>{r.name}</td><td>{r.symbol}</td><td>Reference video snapshot, 2026-11-21</td></tr>)}</tbody></table>
            </>
          )}
          <p className="small">Source: <span className="mono">LaunchCreated</span> logs from the SDK V4 factory <span className="mono">{FACTORY}</span> via {RPC_URL}, enriched with live pool reads (quoteReserve, baseReserve, migrationQuoteThreshold, currentFeeBps, status) and ERC-20 name/symbol. Click a row to trade it.</p>
        </section>
      )}

      {tab === 'swap' && <SwapPanel launch={selected} launches={launches} onSelect={setSelectedCurve} wallet={wallet} onConnect={onConnect} showToast={showToast} />}
      {tab === 'studio' && <LaunchStudio wallet={wallet} onConnect={onConnect} showToast={showToast} />}
      {tab === 'dashboard' && <Dashboard wallet={wallet} launches={launches} showToast={showToast} />}
      {tab === 'catalog' && (
        <section className="card">
          <h2>SDK deployment catalog — GIWA Sepolia</h2>
          <p className="small">Rendered in code from <span className="mono">giwaSepoliaAutoRouteDeployment</span> imported from <span className="mono">@ammora-protocol/sdk@{SDK_VERSION}</span> (Math {MATH_VERSION}) — not hardcoded. Slot <span className="mono">{String(deployment.slot)}</span> · start block <span className="mono">{String(deployment.startBlock)}</span> · generation: auto-route V4.</p>
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Contract</th><th>Group</th><th>Address</th></tr></thead>
            <tbody>{catalog.map((c) => <tr key={c.label}><td>{c.label}</td><td>{c.group}</td><td className="mono">{c.address ? <a href={`${EXPLORER}/address/${c.address}`} target="_blank" rel="noreferrer">{c.address}</a> : '— (null in SDK deployment)'}</td></tr>)}</tbody></table></div>
          <p className="small">WETH: <span className="mono">{WETH}</span> · Config Registry: <span className="mono">{CONFIG_REGISTRY}</span></p>
        </section>
      )}

      <footer className="small" style={{ marginTop: 24 }}>
        Velt Launch · Built by velt for the Ammora Builder Mission (Season 2) · @ammora-protocol/sdk@{SDK_VERSION} · GIWA Sepolia {CHAIN_ID} · Testnet only, no real value.
      </footer>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function SwapPanel({ launch, launches, onSelect, wallet, onConnect, showToast }: {
  launch?: Launch; launches: Launch[]; onSelect: (c: string) => void; wallet: string; onConnect: () => void; showToast: (m: string) => void
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.01')
  const [slippage, setSlippage] = useState(1)
  const [quote, setQuote] = useState<{ out: bigint; fee: bigint; left: bigint } | null>(null)
  const [quoteErr, setQuoteErr] = useState('')
  const [prepared, setPrepared] = useState<{ to: string; data: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const baseForQuote = side === 'sell'
  const inDecimals = side === 'buy' ? 18 : (launch?.decimals ?? 18)
  const outDecimals = side === 'buy' ? (launch?.decimals ?? 18) : 18
  const inSymbol = side === 'buy' ? 'WETH' : (launch?.symbol ?? 'TOKEN')
  const outSymbol = side === 'buy' ? (launch?.symbol ?? 'TOKEN') : 'WETH'

  useEffect(() => { setQuote(null); setPrepared(null); setQuoteErr('') }, [launch?.curve, side])

  async function getQuote() {
    if (!launch) return
    setBusy(true); setQuoteErr(''); setPrepared(null)
    try {
      const q = await quoteSwap(launch.curve, amount, baseForQuote, inDecimals)
      setQuote({ out: q.amountOut, fee: q.fee, left: q.amountLeft })
    } catch (e) { setQuoteErr(e instanceof Error ? e.message.slice(0, 220) : 'Quote failed — pool may be migrated/closed or amount invalid.') }
    finally { setBusy(false) }
  }

  function prepare() {
    if (!launch || !quote) return
    if (!wallet) { showToast('Connect MetaMask first — recipient is your wallet.'); return }
    let amountIn: bigint
    try { amountIn = parseUnits(amount || '0', inDecimals) } catch { showToast('Invalid amount'); return }
    const minOut = applySlippage(quote.out, slippage)
    const call = prepareSwapCalldata({ curve: launch.curve as Address, amountIn, minOut, baseForQuote, recipient: wallet as Address })
    setPrepared({ to: call.to, data: call.data })
  }

  async function confirmSend() {
    if (!prepared || !wallet) return
    try {
      const hash = await sendPreparedCall(wallet, prepared.to, prepared.data)
      showToast(`Sent — tx ${hash}. Verify it in your wallet / explorer; success is only confirmed on-chain.`)
    } catch (e) { showToast(e instanceof Error ? e.message.slice(0, 180) : 'Transaction rejected / failed to send') }
  }

  if (!launch) return <section className="card"><h2>Exchange / Swap</h2><p>Waiting for live launches… if the RPC is unreachable, go back to Live Launches — the labelled fallback snapshot has no tradeable curves, and this panel will not invent one.</p></section>

  const feePct = Number(launch.feeBps) / 100
  return (
    <section className="grid cols2">
      <div className="card">
        <h2>Exchange — Swap</h2>
        <label>Launch</label>
        <select value={launch.curve} onChange={(e) => onSelect(e.target.value)}>
          {launches.map((l) => <option key={l.curve} value={l.curve}>{l.name} ({l.symbol}) · Config #{l.configId.toString()}</option>)}
        </select>
        <div className="tabs">
          <button className={`tab ${side === 'buy' ? 'on' : ''}`} onClick={() => setSide('buy')}>Buy with WETH</button>
          <button className={`tab ${side === 'sell' ? 'on' : ''}`} onClick={() => setSide('sell')}>Sell for WETH</button>
        </div>
        <label>You pay ({inSymbol}) {side === 'sell' ? '— selling requires the token allowance for this curve in your wallet, exact amount only' : ''}</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <label>Slippage tolerance (%)</label>
        <input type="number" min={0} max={20} step={0.5} value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} />
        <button className="btn" disabled={busy} onClick={() => void getQuote()}>{busy ? 'Quoting…' : 'Get live quote (quoteExactInput)'}</button>
        {quoteErr && <div className="alert bad" style={{ marginTop: 12 }}>{quoteErr}</div>}
        {quote && (
          <div style={{ marginTop: 14 }}>
            <div className="kv"><span>You receive (est.)</span><b>{fmt(quote.out, outDecimals)} {outSymbol}</b></div>
            <div className="kv"><span>Curve fee (in {inSymbol})</span><b>{fmt(quote.fee, inDecimals)}</b></div>
            <div className="kv"><span>Unfilled / left</span><b>{fmt(quote.left, inDecimals)} {inSymbol}</b></div>
            <div className="kv"><span>Min. out after {slippage}% slippage</span><b>{fmt(applySlippage(quote.out, slippage), outDecimals)} {outSymbol}</b></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {!wallet ? <button className="btn secondary" onClick={onConnect}>Connect wallet to prepare</button> :
                <button className="btn secondary" onClick={prepare}>Prepare swapExactInput call</button>}
            </div>
          </div>
        )}
        {prepared && (
          <div style={{ marginTop: 14 }}>
            <h3>Prepared call — inspect before signing</h3>
            <pre>{JSON.stringify({ to: prepared.to, function: 'swapExactInput', data: prepared.data }, null, 2)}</pre>
            <div className="alert">Sending opens MetaMask. Check the curve address, amount and min-out there. Exact-amount ERC-20 approval may be requested by your wallet first if allowance is insufficient — never approve unlimited.</div>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => void confirmSend()}>Confirm in MetaMask &amp; send</button>
          </div>
        )}
      </div>
      <div className="card">
        <h2>Curve details</h2>
        <div className="kv"><span>Token</span><b>{launch.name} ({launch.symbol})</b></div>
        <div className="kv"><span>Status</span><b>{poolStatusLabel(launch.statusCode)}</b></div>
        <div className="kv"><span>Config</span><b>#{launch.configId.toString()}</b></div>
        <div className="kv"><span>Quote reserve</span><b>{fmt(launch.quoteReserve, 18)} WETH</b></div>
        <div className="kv"><span>Base reserve</span><b>{fmt(launch.baseReserve, launch.decimals)} {launch.symbol}</b></div>
        <div className="kv"><span>Curve fee</span><b>{feePct.toFixed(2)}% (live currentFeeBps: {launch.feeBps.toString()})</b></div>
        <div className="kv"><span>Migration quote threshold</span><b>{fmt(launch.migrationQuoteThreshold, 18)} WETH</b></div>
        <div className="kv"><span>Graduation progress</span><b>{graduationPct(launch).toFixed(2)}% of threshold</b></div>
        <div className="bar" style={{ margin: '10px 0' }}><i style={{ width: `${graduationPct(launch)}%` }} /></div>
        <div className="kv"><span>Curve (pool)</span><b className="mono">{shortAddr(launch.curve)}</b></div>
        <div className="kv"><span>Token contract</span><b className="mono">{shortAddr(launch.token)}</b></div>
        <div className="kv"><span>Creator</span><b className="mono">{shortAddr(launch.creator)}</b></div>
        <p className="small"><a href={`${EXPLORER}/address/${launch.curve}`} target="_blank" rel="noreferrer">View curve on GIWA explorer ↗</a> · Reserves are live reads at load time — refresh for current values.</p>
      </div>
    </section>
  )
}

function LaunchStudio({ wallet, onConnect, showToast }: { wallet: string; onConnect: () => void; showToast: (m: string) => void }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('Velt Token')
  const [symbol, setSymbol] = useState('VELT')
  const [supply, setSupply] = useState('1000000000')
  const [configMode, setConfigMode] = useState<'reuse10' | 'own' | 'blocked6'>('reuse10')
  const [ownConfigId, setOwnConfigId] = useState('11')
  const [firstBuy, setFirstBuy] = useState('0.01')
  const [plan, setPlan] = useState<object | null>(null)

  const chosenConfig = configMode === 'reuse10' ? REUSE_CONFIG : configMode === 'blocked6' ? BLOCKED_CONFIG : (() => { try { return BigInt(ownConfigId || '0') } catch { return 0n } })()
  const blocked = chosenConfig === BLOCKED_CONFIG

  function buildPlan() {
    if (blocked) { showToast('Config #6 is HARD BLOCKED — choose Config #10 or your own qualified Config.'); return }
    if (!name.trim() || !symbol.trim()) { showToast('Token name and symbol are required.'); return }
    const p = {
      app: 'Velt Launch', sdk: `@ammora-protocol/sdk@${SDK_VERSION}`, math: `@ammora-protocol/math@${MATH_VERSION}`,
      chainId: CHAIN_ID, rpc: RPC_URL, factory: FACTORY, configRegistry: CONFIG_REGISTRY, weth: WETH,
      token: { name, symbol: symbol.toUpperCase(), totalSupply: supply },
      config: { mode: configMode, configId: chosenConfig.toString() },
      firstBuyWETH: firstBuy,
      steps: [
        '1. Connect MetaMask + switch to GIWA Sepolia (91342)',
        '2. Create/select Config — reuse #10 or create your own qualified Config (never #6)',
        '3. Issue token on ALC curve via factory createLaunch (SDK ABI / planner)',
        `4. Optional initial buy: ${firstBuy} WETH via first-buy executor / pool swapExactInput`,
        '5. Token live on ALC — trade, watch graduation, then migrate to ARL pool',
      ],
      note: 'This is a launch PLAN. Broadcasting requires signing each on-chain step in MetaMask in the full flow — no step is auto-sent from this plan builder.',
    }
    setPlan(p); setStep(4)
  }

  return (
    <section className="card">
      <h2>Launch Studio — 4 stages</h2>
      <div className="steps">
        {['1 · Token details', '2 · Verify Config', '3 · Review costs / preview', '4 · Confirm via MetaMask'].map((s, i) => (
          <div key={s} className={`step ${step === i + 1 ? 'on' : ''}`}>{s}</div>
        ))}
      </div>

      {step === 1 && (<>
        <label>Token name</label><input value={name} onChange={(e) => setName(e.target.value)} />
        <label>Symbol</label><input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 10))} />
        <label>Total supply (whole tokens)</label><input value={supply} onChange={(e) => setSupply(e.target.value)} inputMode="numeric" />
        <button className="btn" onClick={() => setStep(2)}>Next — verify Config →</button>
      </>)}

      {step === 2 && (<>
        <label>Launch Config</label>
        <select value={configMode} onChange={(e) => setConfigMode(e.target.value as typeof configMode)}>
          <option value="reuse10">Reuse Config #10 — test-observed, allowed</option>
          <option value="own">Create / use my own qualified Config</option>
          <option value="blocked6">Config #6 — DO NOT USE (blocked)</option>
        </select>
        {configMode === 'own' && (<><label>Your Config ID</label><input value={ownConfigId} onChange={(e) => setOwnConfigId(e.target.value)} /></>)}
        {blocked && <div className="alert bad"><b>⛔ Config #6 is HARD BLOCKED.</b> Graduation readiness notice (Ammora docs): do not use chain 91342 / Registry {REGISTRY_FROM_TASK} / Config 6 for new launches, even if enabled. This policy can sell all base inventory and fail migration. Replace it with an explicitly qualified policy and verify derived graduation reserves, including migrationBaseThreshold = 0. Config #10 is a test observation, not an automatic replacement — verify your Config before launching.</div>}
        {configMode === 'reuse10' && <div className="alert good">Reusing Config #10 as in the verified reference path. Still verify fee recipients and graduation reserves in the preview before signing anything.</div>}
        <div style={{ display: 'flex', gap: 8 }}><button className="btn secondary" onClick={() => setStep(1)}>← Back</button><button className="btn" disabled={blocked} onClick={() => setStep(3)}>Next — review →</button></div>
      </>)}

      {step === 3 && (<>
        <div className="kv"><span>Token</span><b>{name} ({symbol.toUpperCase()}) · supply {supply}</b></div>
        <div className="kv"><span>Config</span><b>#{chosenConfig.toString()} ({configMode})</b></div>
        <div className="kv"><span>Network</span><b>GIWA Sepolia {CHAIN_ID} · WETH {shortAddr(WETH)}</b></div>
        <label>Initial buy (WETH, optional)</label><input value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} inputMode="decimal" />
        <p className="small">Costs are testnet gas + your optional first buy only. Exact pool-creation / trading fees are read from the live Config/pool at execution time — this preview does not invent a fee figure.</p>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn secondary" onClick={() => setStep(2)}>← Back</button><button className="btn" onClick={buildPlan}>Build launch plan →</button></div>
      </>)}

      {step === 4 && plan && (<>
        <div className="alert">Plan ready. <b>Nothing has been broadcast.</b> To execute for real: connect MetaMask, then sign Config creation (if creating your own), token issuance and the first buy as separate wallet confirmations, verifying each preview hash. This page does not fake a launch success.</div>
        <pre>{JSON.stringify(plan, null, 2)}</pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(plan, null, 2)); showToast('Plan copied') }}>Copy plan (.json)</button>
          <button className="btn secondary" onClick={() => {
            const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'velt-launch-plan.json'; a.click()
          }}>Download plan</button>
          {!wallet ? <button className="btn" onClick={onConnect}>Connect MetaMask (GIWA Sepolia)</button> : <span className="badge good">Wallet connected: {shortAddr(wallet)} — execution signing happens step-by-step in MetaMask</span>}
          <button className="btn secondary" onClick={() => setStep(1)}>Start over</button>
        </div>
      </>)}
    </section>
  )
}

function Dashboard({ wallet, launches, showToast }: { wallet: string; launches: Launch[]; showToast: (m: string) => void }) {
  const mine = wallet ? launches.filter((l) => l.creator.toLowerCase() === wallet.toLowerCase()) : []
  const [claimPlan, setClaimPlan] = useState('')
  function planClaim() {
    setClaimPlan(JSON.stringify({
      planner: 'FeeVault claim planner (SDK feeSharing / buildClaimFeeVault family)',
      wallet: wallet || '(connect wallet)',
      steps: [
        'Read accrued Creator / Partner fees for your launches from the FeeVault / fee controller',
        'Build the claim call with the SDK planner for the specific pool/position',
        'Preview: recipient = your wallet, token, exact amount — verify before signing',
        'Confirm in MetaMask; claim is only complete when the tx confirms on GIWA explorer',
      ],
      note: 'Planner only — no claim amount is shown because none was read live for this wallet in this session. Connect the creator wallet and read the pool fee state to get a real figure.',
    }, null, 2))
    showToast('Claim plan built — see below')
  }
  return (
    <section className="grid cols2">
      <div className="card">
        <h2>Creator dashboard</h2>
        {!wallet && <p className="small">Connect MetaMask to filter launches by creator address.</p>}
        {wallet && (mine.length ? mine.map((l) => <div key={l.curve} className="kv"><span>{l.name} ({l.symbol})</span><b>{graduationPct(l).toFixed(1)}% graduated</b></div>) :
          <p className="small">No live launches in the current scan were created by {shortAddr(wallet)}. That is a scan-range result, not proof you have never launched.</p>)}
        <div className="kv"><span>Launches in current live scan</span><b>{launches.length}</b></div>
        <div className="kv"><span>Your role</span><b>{wallet ? 'Creator / trader (by connected address)' : 'Guest — read only'}</b></div>
      </div>
      <div className="card">
        <h2>FeeVault claim planner</h2>
        <p className="small">Plan Creator &amp; Partner FeeVault claims and LP NFT fee claims (post-graduation ARL). The planner prepares the call; signing is always in MetaMask, recipient is your own wallet.</p>
        <button className="btn" onClick={planClaim}>Build claim plan</button>
        {claimPlan && <pre style={{ marginTop: 12 }}>{claimPlan}</pre>}
        <h3 style={{ marginTop: 16 }}>Mission checklist</h3>
        <p className="small">✓ Launchpad + Exchange in one app · ✓ SDK {SDK_VERSION} pinned · ✓ GIWA Sepolia {CHAIN_ID} · ✓ Config #6 blocked · ☐ Post the live Vercel URL on X · ☐ Submit the website link in the Ammora Builder Mission for review</p>
      </div>
    </section>
  )
}
