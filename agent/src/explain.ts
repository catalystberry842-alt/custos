import { BRAND } from "./brand.js";
/**
 * explain.ts — the plain-language "what happens next" block. Fully deterministic and fact-checked
 * by construction: the LLM never writes or edits this part.
 */
import type { MessageFacts } from "./types.js";

export function nextSteps(f: MessageFacts): string[] {
  const o = f.ownerName;
  const b = f.beneficiaryName;
  switch (`${f.audience}:${f.stage}`) {
    case "owner:nudge":
    case "owner:reminder":
      return [
        `Tap the check-in link below. It takes a few seconds and restarts your timer to a full ${f.interval}.`,
        `Your current deadline is ${f.deadline} (${f.timeLeft} left). Nothing happens if you check in before then.`,
        `If you miss it, you still get a grace period of ${f.graceLength}, and reminders get louder.`,
      ];
    case "owner:overdue":
      return [
        `Your deadline passed. You're in a grace period of ${f.graceLength}, ending ${f.graceEnd}.`,
        `Nothing has been released. Checking in now cancels everything and restarts the timer.`,
        `If the grace period ends, your guardians are asked to confirm. Even then there is a challenge window of ${f.challengeLength} where you can still cancel.`,
      ];
    case "owner:final_warning":
      return [
        `Your guardians can now start the release process (${f.approvalsNeed} of ${f.guardianTotal} must agree).`,
        `After they agree, a challenge window of ${f.challengeLength} starts. Checking in at any point before the release is executed cancels it.`,
        `Funds only ever go to ${b}, the person you chose.`,
      ];
    case "owner:challenge_started":
      return [
        `${f.approvalsNeed} of ${f.guardianTotal} guardians approved ${f.outcome === "handover" ? `a handover to ${f.successorName}` : "a release"}. It can be executed after ${f.challengeEnd}.`,
        `Check in now to cancel it. All votes are wiped and your timer restarts.`,
        f.outcome === "handover"
          ? `If you do nothing, ${f.successorName} becomes the owner of the vault and its funds. ${f.agentName ?? "Your agent"} loses its permissions.`
          : `If you do nothing, everything in the vault goes to ${b}${f.agentName ? ` and ${f.agentName} is shut down` : ""}.`,
      ];
    case "owner:executable":
      return [
        `The challenge window is over. Anyone can now execute the ${f.outcome === "handover" ? "handover" : "release"} at any moment.`,
        `Checking in is still possible until it is executed. Do it now.`,
      ];
    case "owner:released":
      return [
        `The vault was released to ${b}. This is final and cannot be undone.`,
        ...(f.agentName ? [`${f.agentName} was shut down for good: it can no longer spend.`] : []),
      ];
    case "owner:all_clear":
      return [
        `Your timer was reset to a full ${f.interval}. Next deadline: ${f.deadline}.`,
        `Any guardian votes were cleared. No action needed.`,
      ];
    case "guardians:guardian_heads_up":
      return [
        `Please try to reach ${o} now (call, message, or visit). A simple "I'm fine" from ${o} fixes this.`,
        `You do not need to do anything on-chain yet. Voting only opens after the grace period ends on ${f.graceEnd}.`,
        `If you know ${o} is alive and well, never approve a release.`,
      ];
    case "guardians:guardian_vote_open":
      return [
        `The grace period is over. If you believe ${o} is truly unreachable, approve the release in the ${BRAND.name} app.`,
        `${f.approvalsNeed} of ${f.guardianTotal} guardians must approve (currently ${f.approvalsHave}).`,
        ...(f.agentName
          ? [`${f.agentName} is already frozen. You choose between two outcomes ${o} set in advance: hand everything over to ${f.successorName ?? "the named successor"}, or shut ${f.agentName} down and return the funds to ${b}.`]
          : []),
        `After that, a challenge window of ${f.challengeLength} starts; ${o} can still cancel by checking in. Funds can only go to ${b}, which ${o} chose. You cannot redirect them.`,
      ];
    case "guardians:challenge_started":
      return [
        `Enough guardians approved ${f.outcome === "handover" ? `the handover to ${f.successorName}` : "the release"}. It can be executed after ${f.challengeEnd}.`,
        `If ${o} shows up, the owner's check-in cancels it automatically.`,
      ];
    case "guardians:executable":
      return [
        f.outcome === "handover"
          ? `The challenge window is over. Anyone can now press "Execute" in the app; the vault and funds go to ${f.successorName}.`
          : `The challenge window is over. Anyone can now press "Execute release" in the app; funds go to ${b}.`,
      ];
    case "guardians:released":
      return [`The release went through. Funds were sent to ${b}${f.agentName ? ` and ${f.agentName} was shut down` : ""}. Your job as guardian is done. Thank you.`];
    case "guardians:all_clear":
      return [`${o} checked in, so the alarm is cancelled and all votes are void. No action needed.`];
    case "beneficiary:released":
      return [
        `${o} named you as the person to receive their ${BRAND.name} vault, and its release conditions have been met.`,
        `Assets are sent to the wallet address ${o} registered for you. Check that wallet.`,
        `If the transfer shows as failed, open the ${BRAND.name} app: you can redirect the payout to another address and sweep again.`,
      ];
    // ───────────── managed AI agent ─────────────
    case "owner:agent_spent":
      return [
        `${f.spendCount && f.spendCount > 1 ? `${f.spendCount} payments since my last note, ${f.totalText} in total. ` : ""}${f.agentName} can only pay people on your allowed list, inside the limits you set.`,
        f.remainingText ? `Budget: ${f.limitText}. Used so far in this period: ${f.usedText}. Left: ${f.remainingText}.` : `Limits: ${f.limitText}.`,
        `If anything looks wrong, freeze ${f.agentName} in the app. It takes one tap and you can unfreeze it later.`,
      ];
    case "owner:agent_near_limit":
      return [
        `${f.agentName} has used ${f.usedText} of its budget (${f.limitText}). ${f.remainingText} is left${f.windowResets ? `, and the budget resets ${f.windowResets}` : ""}.`,
        `At the limit it simply stops: it cannot go over. Raise the budget in the app only if you meant for it to spend more.`,
      ];
    case "owner:agent_blocked":
      return [
        `Why: ${f.blockText}.${f.spendCount && f.spendCount > 1 ? ` That is ${f.spendCount} blocked attempts since my last note.` : ""}`,
        `Your funds are safe: the limits are enforced by the contract, not by ${f.agentName}.`,
        `Unexpected attempts can mean a bug or that the agent was tricked. Consider freezing it and reviewing what it was told to do.`,
      ];
    case "owner:agent_frozen":
      return f.freezeReason === "lapsed"
        ? [
            `${f.agentName} has stopped spending because you have not checked in. It cannot spend again until you do.`,
            `Check in and ${f.agentName} unfreezes by itself. Nothing else is needed.`,
            `If you stay silent, your guardians can hand ${f.agentName}'s funds to ${f.successorName ?? "your successor"} or return them to ${f.beneficiaryName}.`,
          ]
        : f.freezeReason === "guardian"
          ? [
              `A guardian froze ${f.agentName} because you are overdue. It cannot spend until you act.`,
              `Check in to unfreeze it right away. Any owner action does that.`,
            ]
          : [`You froze ${f.agentName}. It cannot spend until you unfreeze it in the app.`];
    case "owner:agent_unfrozen":
      return [
        `You are back, so ${f.agentName} works again, inside the same limits as before.`,
        `Anything guardians had started was cancelled.`,
      ];
    case "owner:agent_handover":
      return [
        `The vault and ${f.agentName}'s funds now belong to ${f.successorName}, as you set up in advance. You no longer control them.`,
        `${f.agentName}'s permissions were removed. ${f.successorName} decides whether to authorise an agent again.`,
      ];
    case "guardians:agent_frozen":
      return [
        `Please try to reach ${o}. If ${o} cannot be reached after the grace period, you can vote: hand ${f.agentName}'s funds to ${f.successorName ?? "the named successor"}, or return them to ${b}.`,
        `You can only choose between destinations ${o} picked in advance.`,
      ];
    case "guardians:agent_unfrozen":
      return [`${o} is back, so ${f.agentName} works again and any votes are void. No action needed.`];
    case "guardians:agent_handover":
      return [`The vault and ${f.agentName}'s funds were handed to ${f.successorName}, as ${o} set up. Your job on this decision is done. Thank you.`];
    case "successor:agent_handover":
      return [
        `${o} named you as their successor. You now control the ${f.agentName ? `vault ${f.agentName} was working from` : "vault"} and its funds.`,
        `${f.agentName ?? "The agent"} has no permissions anymore. Authorise an agent again only if you want one, with limits you choose.`,
        `Check in regularly: the same safety net now protects you, with the same guardians.`,
      ];
    default:
      return [];
  }
}

export function subjectFor(f: MessageFacts): string {
  switch (`${f.audience}:${f.stage}`) {
    case "owner:nudge": return `${BRAND.name} check-in`;
    case "owner:reminder": return `${BRAND.name} check-in due soon`;
    case "owner:overdue": return `${BRAND.name} check-in OVERDUE`;
    case "owner:final_warning": return `${BRAND.name}: guardians can now act`;
    case "owner:challenge_started": return "URGENT: release pending: check in to cancel";
    case "owner:executable": return "URGENT: release can execute any moment";
    case "owner:released": return `${BRAND.name} vault released`;
    case "owner:all_clear": return `${BRAND.name}: timer reset`;
    case "guardians:guardian_heads_up": return `Heads-up: ${f.ownerName} hasn't checked in`;
    case "guardians:guardian_vote_open": return `Action needed: voting open for ${f.ownerName}'s vault`;
    case "guardians:challenge_started": return `Release approved for ${f.ownerName}'s vault`;
    case "guardians:executable": return `Release can now be executed`;
    case "guardians:released": return "Vault released";
    case "guardians:all_clear": return `Alarm cancelled: ${f.ownerName} is back`;
    case "beneficiary:released": return `A vault was released to you`;
    case "owner:agent_spent": return `${f.agentName} made a payment`;
    case "owner:agent_near_limit": return `${f.agentName} is near its spending limit`;
    case "owner:agent_blocked": return `${f.agentName} was blocked by your limits`;
    case "owner:agent_frozen": return `${f.agentName} is frozen`;
    case "owner:agent_unfrozen": return `${f.agentName} is working again`;
    case "owner:agent_handover": return `Your vault was handed to ${f.successorName}`;
    case "guardians:agent_frozen": return `${f.ownerName}'s agent ${f.agentName} is frozen`;
    case "guardians:agent_unfrozen": return `${f.ownerName} is back: ${f.agentName} unfrozen`;
    case "guardians:agent_handover": return `Handover done for ${f.ownerName}'s vault`;
    case "successor:agent_handover": return `You are now in charge of ${f.ownerName}'s vault`;
    default: return `${BRAND.name}`;
  }
}
