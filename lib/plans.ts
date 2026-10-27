export const plans = [
  { id: "6h", hours: 6, linkSteps: 0, totalSteps: 1, waitSeconds: 0 },
  { id: "12h", hours: 12, linkSteps: 2, totalSteps: 3, waitSeconds: 49 },
  { id: "24h", hours: 24, linkSteps: 3, totalSteps: 4, waitSeconds: 90 },
] as const;
export type PlanId = (typeof plans)[number]["id"];
export function validPlan(value: unknown): value is PlanId { return plans.some(plan => plan.id === value); }
export function planFor(id: PlanId) { return plans.find(plan => plan.id === id)!; }
