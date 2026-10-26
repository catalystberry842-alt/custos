import type { Snapshot } from "./chainModel.js";

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
}

export type Audience = "owner" | "guardians" | "beneficiary";

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
  | "all_clear";

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
