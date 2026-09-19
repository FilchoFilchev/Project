const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalculator(extra = {}) {
  const context = vm.createContext({ ...extra });
  for (const file of ['customers.js', 'leads.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return context.LeadPredictor;
}

test('customers meet the revenue target, rounded up to whole people', () => {
  const { calculateCustomers } = loadCalculator();
  assert.equal(calculateCustomers(10000, 1000), 10);
  assert.equal(calculateCustomers(10001, 1000), 11);
  assert.equal(calculateCustomers(0, 1000), 0);
  assert.equal(calculateCustomers(0.07, 0.01), 7);
});

test('invalid revenue and order values cannot produce a forecast', () => {
  const { calculateCustomers } = loadCalculator();
  for (const revenue of [-1, NaN, Infinity, '100']) {
    assert.throws(() => calculateCustomers(revenue, 1000));
  }
  for (const order of [0, -1, NaN, Infinity]) {
    assert.throws(() => calculateCustomers(10000, order));
  }
  assert.throws(() => calculateCustomers(Number.MAX_VALUE, 0.01));
});

test('leads account for conversion and round up fractional people', () => {
  const { calculateLeads } = loadCalculator();
  assert.equal(calculateLeads(10, 40), 25);
  assert.equal(calculateLeads(11, 40), 28);
  assert.equal(calculateLeads(10, 100), 10);
  assert.equal(calculateLeads(0, 0), 0);
});

test('unreachable targets and invalid response rates are rejected', () => {
  const { calculateLeads } = loadCalculator();
  for (const rate of [0, -1, 101, NaN, Infinity]) {
    assert.throws(() => calculateLeads(10, rate));
  }
  assert.throws(() => calculateLeads(1.5, 40));
  assert.throws(() => calculateLeads(-1, 40));
});
