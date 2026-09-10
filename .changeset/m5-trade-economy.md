---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Solo-ship trader M5: trade and supplies economy

- M5 kernel: fixed six-good mirror-pair catalog (scrap/meds run ~30%
  cross-hub, fuel flat), per-hub stock ledger with slow restock, buy and
  sell transitions, unpacked-fuel sweep into ship stores, and per-leg
  food settlement (secured cargo first, ship stores second, vitals
  shortfall after) feeding the existing starvation path.
- M5 wire: MARKET_BUY / MARKET_SELL intents (4Hz) with bulk crate-id
  sells, MARKET_STATE listings on telemetry, and hub_b fixture twins so
  both hubs trade. Credits now flow from the owned-ship record into
  VITALS; stores read out in the debug HUD.
- M5 host: server-side funds/stock/stall-adjacency/hands checks, bay
  crate spawns and despawns, immediate reactor-budget refuel on unpack,
  and arrival-edge food settlement with pawn-level starvation.
- M5 web: market console at the market_stall fixture (credit-sized buy
  rows, priced listings, SELL ALL BAY with live value), per-hub market
  channel state, and hands-full hints. Drag-to-pack stays a follow-up;
  checkout seals via auto-pack until then.
