import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function create((address beneficiary, address[] guardians, uint8 threshold, uint64 interval, uint64 grace, uint64 challengeWindow, uint64 fallbackDelay) p) returns (address vault)",
  "function vaultsOf(address owner) view returns (address[])",
  "function totalVaults() view returns (uint256)",
  "event VaultDeployed(address indexed owner, address indexed vault, address indexed beneficiary)",
]);

export const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function agent() view returns (address)",
  "function status() view returns (uint8)",
  "function agentState() view returns (uint8)",
  "function expiry() view returns (uint64)",
  "function graceEnd() view returns (uint64)",
  "function lastCheckIn() view returns (uint64)",
  "function interval() view returns (uint64)",
  "function grace() view returns (uint64)",
  "function agentPeriod() view returns (uint64)",
  "function agentMaxCalls() view returns (uint32)",
  "function agentCalls() view returns (uint32)",
  "function agentCallWindowStart() view returns (uint64)",
  "function assetLimit(address) view returns (uint128 perTx, uint128 perPeriod)",
  "function agentAllowance(address asset) view returns (uint256 perTx, uint256 remainingInPeriod, uint256 periodResetsAt)",
  "function recipients() view returns (address[])",
  "function checkIn()",
  "function setAgent(address agent_, uint64 period_, uint64 lateAllowance_)",
  "function setAssetLimit(address asset, uint128 perTx, uint128 perPeriod)",
  "function setRecipient(address to, bool allowed)",
  "function setAgentCallQuota(uint32 maxCalls)",
  "function freezeAgent()",
  "function unfreezeAgent()",
  "function agentSpend(address asset, address to, uint256 amount)",
  "event VaultCreated(address indexed owner, address indexed beneficiary, uint8 threshold, uint256 guardianCount)",
  "event CheckedIn(address indexed owner, uint64 at, uint256 epoch)",
  "event Deposited(address indexed from, uint256 amount)",
  "event AgentSet(address indexed agent, uint64 period, uint64 lateAllowance)",
  "event AgentRevoked(address indexed agent)",
  "event AssetLimitSet(address indexed asset, uint128 perTx, uint128 perPeriod)",
  "event RecipientSet(address indexed to, bool allowed)",
  "event AgentSpent(address indexed agent, address indexed asset, address indexed to, uint256 amount, uint256 periodSpent, uint256 periodCap)",
  "event AgentFrozen(address indexed by, uint8 kind)",
  "event AgentUnfrozen()",
  "event AgentCallQuotaSet(uint32 maxCalls)",
  "event TimingsUpdated(uint64 interval, uint64 grace, uint64 challengeWindow, uint64 fallbackDelay)",
  "event Released(address indexed beneficiary, uint256 nativeAmount, bool viaFallback)",
]);

export const STATUS = ["Active", "Grace", "AwaitingGuardians", "Challenge", "Executable", "Paused", "Released", "Closed"] as const;
export const AGENT_STATE = ["none", "active", "frozen_owner", "frozen_guardian", "frozen_lapsed", "stopped"] as const;
