// AUTO-COPIED from agent/src/explain.ts by scripts/sync-model.sh — do not edit here.
/**
 * explain.ts — the plain-language "what happens next" block. Fully deterministic and fact-checked
 * by construction: the LLM never writes or edits this part.
 */
import type { MessageFacts } from "./types";

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
        `${f.approvalsNeed} of ${f.guardianTotal} guardians approved a release. It can be executed after ${f.challengeEnd}.`,
        `Check in now to cancel it. All votes are wiped and your timer restarts.`,
        `If you do nothing, everything in the vault goes to ${b}.`,
      ];
    case "owner:executable":
      return [
        `The challenge window is over. Anyone can now execute the release at any moment.`,
        `Checking in is still possible until it is executed. Do it now.`,
      ];
    case "owner:released":
      return [
        `The vault was released to ${b}. This is final and cannot be undone.`,
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
        `The grace period is over. If you believe ${o} is truly unreachable, approve the release in the Heirloom app.`,
        `${f.approvalsNeed} of ${f.guardianTotal} guardians must approve (currently ${f.approvalsHave}).`,
        `After that, a challenge window of ${f.challengeLength} starts; ${o} can still cancel by checking in. Funds can only go to ${b}, which ${o} chose. You cannot redirect them.`,
      ];
    case "guardians:challenge_started":
      return [
        `Enough guardians approved. The release can be executed after ${f.challengeEnd}.`,
        `If ${o} shows up, the owner's check-in cancels it automatically.`,
      ];
    case "guardians:executable":
      return [
        `The challenge window is over. Anyone can now press "Execute release" in the app; funds go to ${b}.`,
      ];
    case "guardians:released":
      return [`The release went through. Funds were sent to ${b}. Your job as guardian is done. Thank you.`];
    case "guardians:all_clear":
      return [`${o} checked in, so the alarm is cancelled and all votes are void. No action needed.`];
    case "beneficiary:released":
      return [
        `${o} named you as the person to receive their Heirloom vault, and its release conditions have been met.`,
        `Assets are sent to the wallet address ${o} registered for you. Check that wallet.`,
        `If the transfer shows as failed, open the Heirloom app: you can redirect the payout to another address and sweep again.`,
      ];
    default:
      return [];
  }
}

export function subjectFor(f: MessageFacts): string {
  switch (`${f.audience}:${f.stage}`) {
    case "owner:nudge": return "Heirloom check-in";
    case "owner:reminder": return "Heirloom check-in due soon";
    case "owner:overdue": return "Heirloom check-in OVERDUE";
    case "owner:final_warning": return "Heirloom: guardians can now act";
    case "owner:challenge_started": return "URGENT: release pending: check in to cancel";
    case "owner:executable": return "URGENT: release can execute any moment";
    case "owner:released": return "Heirloom vault released";
    case "owner:all_clear": return "Heirloom: timer reset";
    case "guardians:guardian_heads_up": return `Heads-up: ${f.ownerName} hasn't checked in`;
    case "guardians:guardian_vote_open": return `Action needed: voting open for ${f.ownerName}'s vault`;
    case "guardians:challenge_started": return `Release approved for ${f.ownerName}'s vault`;
    case "guardians:executable": return `Release can now be executed`;
    case "guardians:released": return "Vault released";
    case "guardians:all_clear": return `Alarm cancelled: ${f.ownerName} is back`;
    case "beneficiary:released": return `A vault was released to you`;
    default: return "Heirloom";
  }
}
