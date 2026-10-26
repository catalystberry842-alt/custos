// AUTO-COPIED from agent/src/types.ts by scripts/sync-model.sh — do not edit here.
import type { Snapshot } from "./chainModel";

export interface Endpoint {
  /** channel adapter name: "telegram" | "mock" | "console" | "email" … */
  channel: string;
  address: string;
}

export interface Contact {
  id: string;
  name: string;
  /** In escalation order. Level 0-1 → first endpoint; level ≥ 2 → all endpoints. */
  endpoints: Endpoint[];
}

/** Off-chain profile of one switch (who to talk to). Never contains keys. */
export interface SwitchProfile {
  id: string;
  /** vault contract address when running against a chain; arbitrary id in simulated mode */
  vault?: string;
  owner: Contact;
  beneficiary: Contact;
  guardians: Contact[];
  /** named successor (gets the vault + the agent's role if guardians vote Handover) */
  successor?: Contact;
}

export type Audience = "owner" | "guardians" | "beneficiary" | "successor";

export type Stage =
  | "nudge"
  | "reminder"
  | "overdue"
  | "final_warning"
  | "guardian_heads_up"
  | "guardian_vote_open"
  | "challenge_started"
  | "executable"
  | "released"
  | "all_clear"
  // ── managed AI agent (the monitoring side) ──
  | "agent_spent"
  | "agent_near_limit"
  | "agent_blocked"
  | "agent_frozen"
  | "agent_unfrozen"
  | "agent_handover";

export type Tone = "friendly" | "firm" | "urgent" | "calm";

export interface Action {
  /** idempotency key, e.g. "3:overdue:1" (epoch:stage:step) */
  key: string;
  stage: Stage;
  audience: Audience;
  /** 0 (gentle) … 4 (loudest). Drives tone + number of channels. */
  level: number;
  tone: Tone;
  /** Everything the wording layer may talk about. All computed by deterministic code. */
  facts: MessageFacts;
}

export interface MessageFacts {
  ownerName: string;
  recipientName: string;
  beneficiaryName: string;
  stage: Stage;
  audience: Audience;
  tone: Tone;
  level: number;
  /** human strings, already formatted */
  timeLeft?: string;
  deadline?: string;
  graceEnd?: string;
  challengeEnd?: string;
  interval: string;
  graceLength: string;
  challengeLength: string;
  approvalsHave: number;
  approvalsNeed: number;
  guardianTotal: number;
  // ── AI agent facts (all pre-formatted by deterministic code) ──
  agentName?: string;
  /** what the pending guardian decision does: send funds to the beneficiary, or hand the vault to the successor */
  outcome?: "release" | "handover";
  successorName?: string;
  /** "lapsed" (owner went quiet), "guardian", "owner" */
  freezeReason?: "lapsed" | "guardian" | "owner";
  /** most recent payment(s), e.g. "$42.50" to "Stripe" */
  amountText?: string;
  payee?: string;
  spendCount?: number;
  totalText?: string;
  /** e.g. "$250 per day" */
  limitText?: string;
  usedText?: string;
  remainingText?: string;
  windowResets?: string;
  /** plain-language reason an attempt was blocked */
  blockText?: string;
  /** when the agent stops working if the owner stays silent */
  cutoffText?: string;
}

export interface Plan {
  send: Action[];
  /** keys that were due but superseded by a later step (so we do not spam after downtime) */
  skip: string[];
}

export interface OutMessage {
  text: string;
  urgent: boolean;
  /** optional link buttons (channels that support them render them) */
  buttons?: { label: string; url: string }[];
}

export type { Snapshot };
