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
**per vault, by the owner, to the operator pool**, in the staking token *or* in a stablecoin/ETH: **fees do not require a
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
6. **Liquidity vs. safety:** bonds in a volatile token can lose value exactly when needed. Consider accepting stablecoin or ETH bonds instead.

## 4. Honest legal / risk note

*Not legal advice. Take advice from qualified counsel in each relevant jurisdiction before any token work.*

1. **Securities / investment-contract risk.** Depending on jurisdiction (e.g. US *Howey*-type analysis; EU MiCA; UK FCA financial-promotion rules;
   Nigeria's ISA 2025 and the SEC's proposed digital-asset rules; many others), a token sold to the public with expectations of profit from others' efforts may be a
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
2. Add an **operator registry with ETH/stablecoin bonds** (no new token) and equivocation-only slashing; audit.
3. Only if operators and users demonstrably need a *shared unit* beyond ETH/stablecoin, revisit a dedicated token with counsel, a published legal
   analysis, no pre-sale promises, and no price/yield marketing.

## 6. Explicit non-goals

* No token sale, airdrop, presale, LP, or listing.
* No promise of price, yield, buyback, burn, or "value accrual".
* No governance control over user vaults.
* No admin keys or upgradability in the core contracts.

## 7. Robinhood Chain launch path (design only, nothing implemented or scheduled)

> Still **design only**. No token contract, auction, pool or listing exists, is written, or is authorised by this
> repository. This section records what a careful launch *would* have to look like if the sections above ever justify one.
> Not legal, tax or investment advice. **No price, return, yield, buyback or "value accrual" promise is made or may be made.**
> Facts checked 2026-10-26; re-check before relying on them.

### 7.1 Why this chain
Heirloom is security and **stablecoin/ETH custody** infrastructure. Robinhood Chain (Arbitrum Orbit L2, chain id 4663, ETH gas) is
built around tokenised real-world assets and stablecoins such as USDG (Paxos); a dead-man's-switch for those holdings fits the
audience. The token question is separate from, and strictly after, shipping and auditing the vaults ([DEPLOY-ROBINHOOD.md](DEPLOY-ROBINHOOD.md)).

### 7.2 The only launch path considered: Uniswap Continuous Clearing Auction ("Launch auction")
Uniswap's [Continuous Clearing Auction (CCA)](https://developers.uniswap.org/docs/liquidity/liquidity-launchpad/concepts/cca.md) is the
only mechanism considered, because it avoids private allocations:

* Supply is released **gradually over the auction's duration**; each block clears at **one uniform price** for every filled bid
  (bidders set a budget and a max price; the price can only rise or stay flat; earlier bids can get lower prices).
* **Graduation threshold:** if the auction does not raise the configured minimum, it fails and **bidders are automatically refunded in full**;
  the team cannot touch funds unless it succeeds.
* On success, proceeds seed a **new Uniswap v4 pool** at the discovered price. The Uniswap web app's *Launch auction* flow lets the team
  pick: duration, auction currency (ETH or USDC), floor price, supply to auction, % of raise to seed, fee tier, price range, LP recipient,
  an optional **LP timelock** (visible to bidders), optional KYC (Predicate), and optional buyback-and-burn from locked-LP fees.
* Reported as live on Robinhood Chain since 13 July 2026. **This must be re-verified** on Uniswap's own deployment/docs pages before any plan relies on it.

Conditions we would impose on ourselves:

1. **No team presale, no private round, no pre-auction airdrop, no insider allocation sold ahead of the public.** Any team/treasury allocation is
   minted to a **vesting contract** (long cliff + linear vest, on-chain, visible before the auction opens) and disclosed in the auction description.
2. **Fixed, public parameters before the auction opens:** total supply, auctioned amount, floor price, duration, graduation threshold, LP timelock,
   vesting schedule. No post-hoc changes; the token has no mint function after creation.
3. **No price talk.** Floor price is a mechanism parameter, not a valuation claim. No "FDV", "x", "up only", yield, buyback or burn promises in any
   channel. Use the CCA's own risk wording; state plainly that the token can lose all value and that Heirloom works without it.
4. **LP locked** for a published period; liquidity recipient is a multisig or the timelock, never a personal EOA.
5. The auction runs only **after** the contracts are audited and have been live without incident for a published period. A token must never be
   the reason to rush the audit.
6. The Uniswap launch UI can *create* the token (a standard ERC-20 whose properties we do not control). If we need custom behaviour
   (e.g. a non-transferable bond receipt), we would deploy and audit our own contract and use the "use existing token" route instead.

### 7.3 The token must have a real job in the product
If it cannot do all of the following, **do not launch one** (ETH/stablecoin fees and bonds already cover §1 without a token):

| Job | Mechanism | Non-negotiable limits |
|---|---|---|
| **Staking guardians / operators** | Professional guardians and check-in operators post a **bond** (§1.1) to be listed by `IGuardianStaking.isEligible`. | Bond only: no yield, no voting. Unbonding delay longer than the maximum challenge window. Vault owners can always pick unstaked friends/family. |
| **Fees** | Optional operator-service fees (SMS/voice, monitoring) paid per vault by the owner. | Fees must be **payable in a stablecoin**; the token is at most a discounted option, never required. No protocol fee switch on vault funds. |
| **Slashing** | Equivocation and missed-attestation faults provable on-chain (§3.1); proceeds to the harmed vault/beneficiary and a burn/safety fund. | No subjective faults; no bounty to the accuser alone; slashing authority is code, not a multisig. |

Hard guardrails: the token never gates, delays, redirects or pauses a release; the core `Heirloom` contract has no token dependency and no admin key;
if the token or registry dies every vault keeps working.

### 7.4 Legal caveats
* **Nigeria.** The SEC Nigeria published draft *Proposed Rules on Digital and Virtual Assets Operations, Custody and Markets* on **20 August 2026**
  under the Investments and Securities Act 2025 (comment period closed in early September 2026). As drafted they would: require prior
  approval or a no-objection for any issuance, offer or distribution of a digital asset **to the public in Nigeria**; apply to anyone who
  **targets Nigerian investors or provides services to Nigerian residents, including offshore and via digital channels**; create registrable functions
  (exchange, custodian, offering platform, platform operator, RWA-tokenisation platform, VASP); and impose custody safeguards (e.g. a cold-storage minimum for custodians).
  **They are proposed, not in force, and the final text may differ**, but the direction is that a public token sale touching Nigerians likely needs prior engagement with the SEC
  (and the CBN has primary say over stablecoin issuance). If the operator is based in Nigeria or targets Nigerians, get **local counsel** before any step. Consider geo-restricting the auction
  (the CCA supports KYC/identity modules) and engaging SEC Nigeria's regulatory incubation route.
* **Elsewhere:** US (Howey-type analysis), EU (MiCA), UK (FCA financial-promotion rules) and others may treat a publicly sold token as a security/regulated crypto-asset,
  especially with marketing that implies profit from the team's efforts. A "fair" auction mechanism does **not** change the legal classification.
* **No price promises, ever** (see 7.2.3); that includes social media, docs, UI copy and team comments. Do not describe any token as an investment.
* Operators handle personal data (NDPR/GDPR); slashing disputes need contracts/terms; an on-chain release is **not a will**.
* Sequencer-level sanctions screening on Robinhood Chain can exclude transactions from sanctioned addresses; auction participation and vault flows are subject to it.

### 7.5 Open design questions
1. Is there *any* token job that stablecoin/ETH bonds and fees cannot do? If not, the answer is **no token**.
2. Which on-chain faults are **objectively** slashable, and what stops owners or attackers faking a fault (EIP-712 equivocation proof design, replay across epochs)?
3. Bond currency: ETH/stablecoin vs. the token (volatile-bond problem: a bond that collapses exactly when it is needed).
4. Supply, auction size, floor price and graduation threshold: how are these set without implying a valuation? Auction currency ETH vs. USDC?
5. Vesting and LP-lock lengths; who holds the multisig; what happens to unsold supply (burn vs. return to a locked treasury)?
6. Geo-fencing/KYC: do we restrict Nigeria (or others) via the CCA's identity module, and is that compatible with a permissionless chain and our open-source stance?
7. Does the Uniswap-created standard ERC-20 suffice, or do we need transfer restrictions (and then does the Launch UI still apply)?
8. Governance: none over vaults; over operator-registry parameters only, immutable or timelocked?
9. Treasury/funding: is the raise even needed? Compare with grants, paid services, or open-source funding.
10. Are fee-in-token discounts a securities-risk amplifier (consumptive vs. investment framing)?
11. Audit scope and bug bounty for the staking/slashing contracts (separate from the core audit).
12. Sybil-resistance for professional guardians: stake doesn't prove independence or competence.
13. Behaviour if Robinhood Chain's sequencer screening blocks a guardian/operator transaction during a challenge window.
14. Exit plan if the token has near-zero adoption: sunset the registry without affecting any vault.

## 8. Supervising AI agents (design only, nothing implemented)

The AI-agent framing adds two roles where a **bond** (stake) could matter. As everywhere in this document: opt-in per vault, never able to
touch a vault's funds, timers, destinations or limits, and **no price, yield or return is promised or implied**.

| Role | What they do for an agent's owner | Why a bond could help |
|---|---|---|
| **Guardian-supervisor** | Holds a guardian seat on vaults that carry an AI agent; watches for a lapsed owner, can freeze the agent, and votes on handover/shutdown | Owners get a checkable signal that the guardian can be held to account if it acts dishonestly (e.g. colludes for an early outcome). The contract already stops destination changes, so slashing targets *process* faults: false freezes, missed duties, provable collusion. |
| **Operator (monitoring service)** | Runs the check-in assistant: watches the agent's activity, tells the owner when it spends, nears limits or is frozen | An owner buying "we will tell you within N minutes" wants an SLA with recourse. |

Open problems specific to agents:
* **Provable faults are narrow.** "The operator didn't warn me" or "the guardian froze too eagerly" is hard to prove on-chain. Only objective, on-chain-checkable faults (e.g. a guardian froze an owner who was provably on time: impossible by contract; an operator signed an attestation it later contradicted) can be slashed. Everything else stays off-chain reputation.
* **Don't re-introduce a trusted party.** Staked supervisors must not be *required*: friends, family or a co-founder remain valid guardians with zero stake. A stake requirement would only be a filter an owner chooses to apply.
* **Stake never gates the agent.** An agent's limits, freeze and handover work identically whether or not any guardian or operator is staked; if the staking registry disappears, every vault still works.
* **Conflicts.** A supervisor must not also be the successor or beneficiary of the same vault: the UI warns today; a registry would enforce it.
* **Legal.** Bonded supervision services and any token that backs them can raise securities, money-transmission and licensing questions (see §4 and §7.4). Treat this section as a thought experiment, and take legal advice before building anything.

Interface sketch (unchanged `IGuardianStaking`): add role ids `GUARDIAN_SUPERVISOR` and `AGENT_OPERATOR` to `isEligible(operator, role)`; the vault stays ignorant of it.
