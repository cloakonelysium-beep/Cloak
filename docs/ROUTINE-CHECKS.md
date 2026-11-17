# Routine health checks

A checklist for a quick "is everything healthy?" pass. Any session (or person) can run it top to bottom in about
ten minutes. Each check says what healthy looks like and what to do if it isn't. Nothing here changes anything:
every command only reads.

Last full run: Nov 17, 2026 (results at the bottom).

## What is running where

| Piece | Where | Address |
|---|---|---|
| Site, both networks | Vercel project `cloak` (team `0xcryptolympus-8055`, Hobby plan), one project serving both by hostname | https://oncloak.xyz (mainnet 99901), https://testnet.oncloak.xyz (testnet 99801) |
| Mainnet keeper | Render `cloak-mainnet-keeper` (`srv-dbrkr78ae00c73fsmpjg`, free plan) | https://cloak-mainnet-keeper.onrender.com, wallet `0x4039F9dD5198108e417A6e568D53b4A8Fd0F5442` |
| Testnet keeper | Render `cloak-testnet-keeper` (`srv-dbqnhgtbedkc73e6oah0`, free plan) | https://cloak-testnet-keeper.onrender.com, wallet `0x04B675C9994e5936Bff2571b8739D41224fCB474` |
| Chains | Elysium | mainnet RPC `https://rpc.elysium.kinetiq.xyz`, testnet RPC `https://testnet-rpc.elysium.kinetiq.xyz` |

What a session needs: the Vercel CLI signed in to the team (`vercel ls` works from `apps/web`), and the Render API
key saved as a network secret for `api.render.com` (the proxy adds it; never paste it).

## 1. Keepers (both networks)

```sh
for u in https://cloak-mainnet-keeper.onrender.com https://cloak-testnet-keeper.onrender.com; do
  curl -s -m 90 -w "  [%{http_code} in %{time_total}s]\n" $u/health; echo; done
```

Healthy:
- HTTP 200, and `chain` is 99901 for mainnet and 99801 for testnet.
- `keeper` is the wallet in the table above, and `relay` and `schedule` are `true`.
- `lastTick` is a few seconds old (run it twice if the first answer was slow).

A first answer of 20 to 60 seconds is normal. On the free plan a keeper with no pending work is allowed to sleep, and
the first request wakes it (`services/keeper/index.mjs`, "staying awake on a free host"). After waking, `lastTick`
should be seconds old. A keeper still `lastTick: 0` a minute after waking, or one that doesn't answer, is unhealthy:
open its Render logs.

## 2. Render services

```sh
for s in srv-dbrkr78ae00c73fsmpjg srv-dbqnhgtbedkc73e6oah0; do
  curl -s "https://api.render.com/v1/services/$s" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['name'],'suspended:',d['suspended'])"
  curl -s "https://api.render.com/v1/services/$s/deploys?limit=1" | python3 -c "import json,sys;x=json.load(sys.stdin)[0]['deploy'];print('  last deploy:',x['status'],x.get('finishedAt'))"
done
```

Healthy: `not_suspended`, last deploy `live`. A `failed` deploy leaves the previous one running, so check why
(usually a missing environment variable) before the next one. The free plan gives 750 instance hours a month for the
whole workspace, and sleeping keepers use none.

## 3. Keeper wallets (gas)

```sh
bal() { curl -s $1 -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$2\",\"latest\"]}" | python3 -c "import json,sys;print(int(json.load(sys.stdin)['result'],16)/1e18,'HYPE')"; }
bal https://rpc.elysium.kinetiq.xyz 0x4039F9dD5198108e417A6e568D53b4A8Fd0F5442
bal https://testnet-rpc.elysium.kinetiq.xyz 0x04B675C9994e5936Bff2571b8739D41224fCB474
```

Top up when the mainnet keeper is below 0.03 HYPE, or the testnet keeper below 0.2. At 0.5 gwei a relay costs about
0.001 HYPE. A top-up is a plain HYPE transfer from the owner wallet, done by a person; a session never holds that key.

## 4. Site (Vercel)

```sh
cd apps/web
vercel ls | head -8                                                     # the newest Production deploy is "Ready"
vercel metrics vercel.request.count -p cloak --since 1d --json          # requests in the last 24h
vercel metrics vercel.analytics.page_view.count -p cloak --since 1d --json
```

Healthy: the newest Production deploy is `Ready`, and usage is far under the Hobby limits (about 1M edge requests and
100 GB transfer a month). Metrics older than 1 day, or grouped by status, need a paid add-on, so the 1-day totals are
what this plan can see.

Page checks. Vercel's Bot Protection (Challenge) shows a checkpoint (HTTP 429) to scripts and headless browsers, so
`curl https://oncloak.xyz/app` failing is expected and not an outage. These paths skip it, and also prove the site's
functions reach each chain:

```sh
for h in oncloak.xyz testnet.oncloak.xyz; do
  curl -s -m 30 -o /dev/null -w "$h tokenlist: %{http_code} %{time_total}s\n" "https://$h/api/tokenlist?feed=1"; done
```

Healthy: 200 on both. To look at pages themselves, open them in a normal browser. To test the app end to end, build
it locally and serve it as oncloak.xyz (the Spicenet notes on the `spicenet` branch show how: a Chromium
`--host-resolver-rules` map and a local HTTPS front).

## 5. Chains

```sh
for r in https://rpc.elysium.kinetiq.xyz https://testnet-rpc.elysium.kinetiq.xyz; do
  curl -s $r -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'; echo; done
```

Healthy: both answer, and a second run a minute later shows a higher block.

## 6. Spicenet escrow (once Spicenet is live)

The escrow `0x7839287eAc1Db87b53aF06Be2A704f25F2186102` on Elysium mainnet pays every Spicenet deposit. Its USDC
(`0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65`) balance caps one deposit; Spicenet tops it up automatically. Below
about 50 USDC, tell Spicenet.

## Results, Nov 17, 2026

| Check | Result |
|---|---|
| Mainnet keeper | Healthy. Woke from sleep in 26 s, then answered in 0.3 s, ticking every few seconds. Chain 99901, relay and schedule on |
| Testnet keeper | Healthy. Woke in 28 s, then answered in 0.4 s, ticking. Chain 99801 |
| Render | Both services live, not suspended, last deploy Nov 14 succeeded. The history rewrite on Nov 17 triggered no redeploy |
| Keeper gas | Mainnet 0.068 HYPE (38 transactions so far), testnet 0.69 HYPE. Both fine |
| Vercel | Newest Production deploy Ready. Last 24h: 2,770 requests, 199 page views, far under the limits |
| Mainnet functions | `/api/tokenlist` and `/tokenlist.json` answer 200 |
| Testnet functions | `/api/tokenlist` answers 503 ("the network didn't answer") every time from Vercel, though the same code run locally against testnet answers in 2.5 s. Testnet only, and only the token list feed for wallets and partners; the testnet app itself reads the chain from the browser. To look into: the function hides the error, so log it first |
| Bypass paths | `/llms.txt` gets the checkpoint (429) although `docs/VERCEL-FIREWALL.md` lists it as bypassed: check the bypass rule in the Vercel Firewall dashboard |
| Chains | Both answering. Mainnet block 7,608,052, testnet 29,844,001 |
| Spicenet escrow | 199.76 USDC, four small payouts made |
