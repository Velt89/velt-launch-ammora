# Velt Launch — Ammora Launchpad + Exchange

A launchpad (headline) with an exchange / trading terminal inside it, built for the
**Ammora Builder Mission (Season 2)** with the Ammora SDK on GIWA Sepolia testnet.

Live structure, modelled on the reference Vercel exchange build:
1. **Live Launches** — tokens discovered on-chain from `LaunchCreated` logs of the
   Ammora V4 factory (SDK deployment catalog), enriched with live pool reads:
   name/symbol, Config #, curve address, status, WETH reserve, graduation progress.
   If the RPC is unreachable, a clearly-labelled fallback snapshot is shown —
   reserves are never presented as live when they were not read live.
2. **Exchange / Swap** — select a launch, pay WETH, live `quoteExactInput` quote,
   curve details (reserves, live fee bps, graduation % of migration threshold),
   slippage, and `swapExactInput` call preparation via the SDK pool ABI.
   Sending only happens after an explicit user click + MetaMask confirmation.
3. **Launch Studio** — 4 stages: token details → verify Config → review/preview →
   confirm via MetaMask. **Config #6 is hard-blocked** (see below); Config #10
   reuse is allowed, or create/use your own qualified Config.
4. **Creator Dashboard** — your launches by creator address + FeeVault claim planner.
5. **SDK Catalog** — contract addresses rendered in code from
   `giwaSepoliaAutoRouteDeployment` imported from the SDK. No guessed addresses.

## Stack / pins

- `@ammora-protocol/sdk` **0.3.9** (exact) + `@ammora-protocol/math` **0.3.0**
- `viem` ^2.33.0, React 18, TypeScript, Vite 5
- Chain: **GIWA Sepolia, chain ID 91342**
- RPC: `https://sepolia-rpc.giwa.io` · Explorer: `https://sepolia-explorer.giwa.io`
- Generation: auto-route V4, concentrated graduation (ALC → ReadyToMigrate → ARL)

## ⚠️ Config #6 warning (Ammora docs)

Do **not** use chain 91342 / Registry `0x6d043014972b87406C4757a5f2d655A24e0b0aF9` /
Config 6 for new launches, even if enabled. That policy can sell all base
inventory and fail migration. Use an explicitly qualified Config and verify
derived graduation reserves, including `migrationBaseThreshold = 0`.
Config #10 is a test observation, not an automatic replacement.

## Run locally

```bash
npm install
npm run dev      # local dev
npm run build    # tsc + vite build → dist/
npm run preview  # preview the production build
```

Node 20+ recommended (built/tested on Node 24).

## Deploy to Vercel

1. Push this repo to GitHub as `velt-launch-ammora`.
2. In Vercel: **New Project → Import** that repo. Framework preset: **Vite**
   (also pinned in `vercel.json`: build `npm run build`, output `dist`).
3. Deploy — no environment variables are required. You get a `*.vercel.app` URL.

## Mission submission

- Post the live `*.vercel.app` URL on X, then submit that same website link in
  the Ammora Builder Mission for review.
- Accepted builds enter the bonus draw for $tAMM and an SBT.

## Safety

Testnet only — beta, pre-audit software, no mainnet deployment announced and no
independent audit completed. Test assets have no real value. This app never asks
for a seed phrase/private key, never approves unlimited allowances by default,
and never broadcasts a transaction without your MetaMask confirmation.
No transaction success is ever faked: a swap/launch counts only when its
transaction confirms on the GIWA explorer.
