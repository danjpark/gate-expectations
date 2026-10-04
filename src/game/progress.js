// Engine-independent economy rules. Browser persistence is an adapter in main.js.
export const PAY_FINISH = 10, PAY_ON_TIME = 10, AUTO_CALL_COST = 30;
export const SAVE_VERSION = 1;

export function normalizeSave(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const autoCall = source.autoCall === true;
  return {
    version: SAVE_VERSION,
    money: Number.isSafeInteger(source.money) && source.money >= 0 ? source.money : 0,
    autoCall,
    autoOn: autoCall && source.autoOn === true,
  };
}

export function flightReward(ticks, target) {
  return PAY_FINISH + (ticks <= target ? PAY_ON_TIME : 0);
}
