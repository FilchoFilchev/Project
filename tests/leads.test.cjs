const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalculator(document) {
  const context = vm.createContext(document ? { document } : {});
  for (const file of ['customers.js', 'leads.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return context;
}

test('Formula 02 calculates leads without rounding intermediate results', () => {
  const { calculateCustomers, calculateLeads } = loadCalculator();
  assert.equal(calculateLeads(10, 40), 25);
  assert.equal(calculateLeads(10, 50), 20);
  assert.equal(calculateLeads(10, 100), 10);
  assert.equal(calculateLeads(0, 0), 0);
  assert.equal(calculateLeads(0, 40), 0);
  assert.ok(Math.abs(calculateLeads(calculateCustomers(10001, 1000), 40) - 25.0025) < 1e-10);
});

test('invalid inputs and unreachable positive targets do not produce a lead count', () => {
  const { calculateLeads } = loadCalculator();
  for (const customers of [-1, NaN, Infinity, '10']) {
    assert.throws(() => calculateLeads(customers, 40));
  }
  for (const rate of [0, -1, 101, NaN, Infinity, '40']) {
    assert.throws(() => calculateLeads(10, rate));
  }
  assert.throws(() => calculateLeads(Number.MAX_VALUE, 1));
});

// Exercise both scripts' input handlers together without a browser dependency.
function setupPage() {
  const defaults = { 'total-revenue': 10000, 'average-order-value': 1000, 'lead-response-rate': 40 };
  const ids = [...Object.keys(defaults), 'lead-response-value', 'customers-count', 'leads-count', 'campaign-form'];
  const elements = new Map(ids.map(id => [id, {
    valueAsNumber: defaults[id], validity: { valid: true }, validationMessage: 'Enter a valid value.',
    attributes: {}, listeners: {}, textContent: '',
    style: { setProperty(name, value) { this[name] = value; } },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
  }]));
  loadCalculator({ getElementById: id => elements.get(id) });
  return {
    get: id => elements.get(id),
    change(id, value, valid = true) {
      const input = elements.get(id);
      input.valueAsNumber = value;
      input.validity.valid = valid;
      input.listeners.input.forEach(handler => handler());
    },
  };
}

test('revenue, order value, and lead rate edits update both stages and the slider', () => {
  const { get, change } = setupPage();
  assert.equal(get('customers-count').textContent, '10');
  assert.equal(get('leads-count').textContent, '25');
  change('total-revenue', 20000);
  assert.equal(get('customers-count').textContent, '20');
  assert.equal(get('leads-count').textContent, '50');
  change('average-order-value', 2000);
  assert.equal(get('customers-count').textContent, '10');
  assert.equal(get('leads-count').textContent, '25');
  change('lead-response-rate', 50);
  assert.equal(get('leads-count').textContent, '20');
  assert.equal(get('lead-response-value').textContent, '50.00%');
  assert.equal(get('lead-response-rate').style['--rate'], '50%');
  assert.equal(get('lead-response-rate').attributes['aria-valuetext'], '50%');
  change('total-revenue', 20000.01);
  assert.match(get('leads-count').title, /20\.00001/);
});

test('zero rates and invalid values clear stale results and recover after correction', () => {
  const { get, change } = setupPage();
  change('lead-response-rate', 0);
  assert.equal(get('leads-count').textContent, '\u2014');
  assert.match(get('leads-count').title, /above 0%/);
  assert.equal(get('lead-response-rate').attributes['aria-invalid'], 'true');
  assert.equal(get('customers-count').textContent, '10');
  change('lead-response-rate', 40);
  assert.equal(get('leads-count').textContent, '25');
  assert.equal(get('lead-response-rate').attributes['aria-invalid'], 'false');
  change('average-order-value', NaN, false);
  assert.equal(get('customers-count').textContent, '\u2014');
  assert.equal(get('leads-count').textContent, '\u2014');
  change('average-order-value', 1000);
  assert.equal(get('leads-count').textContent, '25');
  change('total-revenue', 0);
  change('lead-response-rate', 0);
  assert.equal(get('leads-count').textContent, '0');
  assert.equal(get('lead-response-rate').attributes['aria-invalid'], 'false');
  let prevented = false;
  get('campaign-form').listeners.submit.forEach(handler => handler({ preventDefault() { prevented = true; } }));
  assert.ok(prevented);
});
