(() => {
  "use strict";

  const calculator = globalThis.LeadPredictor;

  // Shared conversion for leads and prospects, which use the same formula.
  calculator.requiredAudience = (target, responseRate, label) => {
    if (!Number.isSafeInteger(target) || target < 0) {
      throw new RangeError("The target must be a non-negative whole number of people.");
    }
    if (!Number.isFinite(responseRate) || responseRate < 0 || responseRate > 100) {
      throw new RangeError(`${label} must be between 0% and 100%.`);
    }
    if (target === 0) return 0;
    if (responseRate === 0) {
      throw new RangeError(`${label} must be above 0% to reach a positive revenue target.`);
    }
    return calculator.roundPeople(target * (100 / responseRate));
  };

  // Formula 02: leads = customers * 100 / lead response rate.
  calculator.calculateLeads = (customers, responseRate) =>
    calculator.requiredAudience(customers, responseRate, "Lead response rate");
})();
