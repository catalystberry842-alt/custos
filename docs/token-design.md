# Heirloom: optional token hook (DESIGN ONLY)

> **Status: design note. Nothing here is implemented, deployed, or launched.** No token exists, none is planned by this
> repository, and the core product works with **zero** token. This document only describes where a token *could*
> plug in, and why you might reasonably decide **not** to.
>
> This is not legal, tax, or investment advice. No price, return, or appreciation is promised or implied anywhere.

## 0. Principle: the switch must not depend on a token

`Heirloom.sol` has no token dependency, no admin key, no fee switch and no upgrade path. Owners pay only gas. Any token
feature must be **opt-in per vault** and must never be able to:

* block, delay, or redirect a release,
* change a vault's beneficiary, guardians, or timers,
* pause or censor a vault,
* make an existing vault pay a fee it did not agree to.

If the token (or the registry) dies, every vault keeps working exactly as before.

## 1. What a token could be *for* (utility, not "investment")

### 1.1 Staking to become a listed **guardian service** or **check-in operator**
Two operator roles are professionalisable:

| Role | Does | Needs stake because |
|---|---|---|
| **Professional guardian** (e.g. a law firm, notary, or DAO committee offering guardianship) | holds one guardian seat for paying clients and votes only if its own off-chain verification says the owner is gone | clients want recourse if the guardian acts dishonestly |
| **Check-in operator** | runs the reminder agent (Telegram/email/SMS), relays "owner is alive" confirmations, pages guardians | clients want an SLA: reminders actually get sent |

Staking is a **bond**, not a vote and not a yield product. Stake makes misbehaviour costly; it is returned (minus any
slash) after an unbonding delay (e.g. 14-30 days, longer than any challenge window so late faults can still be slashed).

Vault owners remain free to choose **friends and family as guardians with no stake at all**; staking only matters for
those who prefer a professional/third-party operator and want an on-chain, checkable quality signal
(`IGuardianStaking.isEligible(operator, role)`).

### 1.2 Paying service fees
Optional fees for operator services (SMS/voice costs, monitoring, white-glove guardianship). Payment would happen
**per vault, by the owner, to the operator pool**, in the staking token *or* in a stablecoin/MON: **fees do not require a
token**. A token-denominated fee is only justified if it solves a real problem (e.g. a single unit of account for a
slashable-bond pool). Default recommendation: **price services in stablecoin, hold bonds in a volatile-asset-safe way**
(see §4 risk 3).

### 1.3 Slashing dishonest guardians/operators
The hard part (see §3). Slashing proceeds go to (a) the harmed vault owner/beneficiary and (b) burn or a safety fund;
**never** to whoever submitted the proof alone, to avoid bounty-driven false accusations.

## 2. Interface stub

See [`contracts/src/interfaces/IGuardianStaking.sol`](../contracts/src/interfaces/IGuardianStaking.sol): `stake`,
`requestUnstake`, `unstake`, `stakeOf`, `isEligible`, `slash(operator, vault, amount, reason, proof)`, `payServiceFee`.
It is a **stub**: no implementation exists. A vault would integrate it at most as a *read-only* check in the UI or an
optional "guardian registry" contract, never inside `Heirloom.sol`'s release path.

## 3. Open design problems (why this is non-trivial)

1. **What is a provable fault?** Voting to release is not inherently dishonest: the owner may truly be gone. Only *objectively
   verifiable* faults should be slashable:
   * **Equivocation:** a guardian/operator signs an EIP-712 statement "owner X alive at epoch E" and later votes release in the same
     epoch → two signatures are contradictory proof.
   * **Missed attestation SLA:** an operator that committed to post a signed heartbeat/reminder-receipt within a window, and didn't (needs an
     on-chain challenge/response: the owner or anyone challenges, operator must answer in N blocks).
   * Anything subjective ("they should have called the owner") is **not** slashable on-chain; it would need an arbitration layer, which
     adds trust and legal exposure. Leaving it out is a feature.
2. **Extortion by owners / griefing:** an owner (or attacker) must not be able to slash a guardian by cancelling a release or by creating a
   fake vault. Slashing requires a proof the *vault cannot fabricate alone* (signatures by the operator itself).
3. **Sybil guardians:** staked identities are cheap to duplicate. Stake does not prove independence; owners still must choose unrelated people.
4. **Keeper incentives:** `executeRelease()` is already permissionless; a small tip from the vault to the caller is possible without any token.
5. **Governance minimisation:** parameters (min stake, unbonding, slash %) should be immutable or timelocked; slashing authority must not be a
   multisig that can seize stake at will.
6. **Liquidity vs. safety:** bonds in a volatile token can lose value exactly when needed. Consider accepting stablecoin or MON bonds instead.

## 4. Honest legal / risk note

*Not legal advice. Take advice from qualified counsel in each relevant jurisdiction before any token work.*

1. **Securities / investment-contract risk.** Depending on jurisdiction (e.g. US *Howey*-type analysis; EU MiCA; UK FCA financial-promotion rules;
   Nigeria's ISA 2025 and SEC digital-asset rules; many others), a token sold to the public with expectations of profit from others' efforts may be a
   security or regulated crypto-asset. Marketing, lock-ups, buybacks, "staking rewards" and exchange listings all raise the risk. **Do not** describe
   it as an investment, and do not promise price appreciation, yield, or buybacks.
2. **Custody/money-transmission.** Heirloom is designed non-custodial (owner-held funds in an owner-specific contract, no admin key). Adding
   operator pools, fee collection, or the ability to move user funds could change that analysis.
3. **Bond volatility & slashing disputes.** Slashing someone's stake can create contractual and consumer-protection disputes. Terms of service,
   operator agreements and clear fault definitions are mandatory.
4. **Estate/inheritance law.** An on-chain transfer is **not** a will. Local succession law, forced-heirship rules, taxes and probate may override or
   complicate a release. Heirloom provides a technical mechanism, not legal certainty. Users should also have a conventional will/letter of wishes.
5. **Data protection.** Operators handle contact details (phone, Telegram ID) of owners and guardians: GDPR/NDPR-type duties apply.
6. **Smart-contract risk.** Any staking contract adds attack surface (reentrancy, oracle-free slashing proofs, accounting bugs). It needs its own
   independent audit and a bug bounty; a bug there could lock bonds.
7. **Reputational/launch risk.** Launching a token before product-market fit invites speculation that overwhelms a safety product whose users want boring
   reliability. **Recommended default: do not launch a token.** Charge ordinary fees (stablecoin) or run it as free open-source infrastructure.

## 5. Suggested staged path (if ever pursued)

1. Ship the core switch and the agent with **no token**; collect real usage.
2. Add an **operator registry with MON/stablecoin bonds** (no new token) and equivocation-only slashing; audit.
3. Only if operators and users demonstrably need a *shared unit* beyond MON/stablecoin, revisit a dedicated token with counsel, a published legal
   analysis, no pre-sale promises, and no price/yield marketing.

## 6. Explicit non-goals

* No token sale, airdrop, presale, LP, or listing.
* No promise of price, yield, buyback, burn, or "value accrual".
* No governance control over user vaults.
* No admin keys or upgradability in the core contracts.
