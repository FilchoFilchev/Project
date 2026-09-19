const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalculator(document) {
  const context = vm.createContext(document ? { document } : {});
  for (const file of ['customers.js', 'leads.js', 'prospects.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return context;
}

test('Formula 03 calculates prospects and preserves fractional intermediate values', () => {
  const { calculateCustomers, calculateLeads, calculateProspects } = loadCalculator();
  assert.equal(calculateProspects(25, 20), 125);
  assert.equal(calculateProspects(25, 50), 50);
  assert.equal(calculateProspects(25, 100), 25);
  assert.equal(calculateProspects(0, 0), 0);
  assert.equal(calculateProspects(0, 20), 0);
  const customers = calculateCustomers(10001, 1000);
  const leads = calculateLeads(customers, 40);
  assert.ok(Math.abs(calculateProspects(leads, 20) - 125.0125) < 1e-10);
});

test('invalid prospect rates and unreachable targets are rejected', () => {
  const { calculateProspects } = loadCalculator();
  for (const leads of [-1, NaN, Infinity, '25']) {
    assert.throws(() => calculateProspects(leads, 20));
  }
  for (const rate of [0, -1, 101, NaN, Infinity, '20']) {
    assert.throws(() => calculateProspects(25, rate));
  }
  assert.throws(() => calculateProspects(Number.MAX_VALUE, 1));
});

// Test all three scripts' event handlers together in a lightweight DOM fixture.
function setupPage() {
  const defaults = {
    'total-revenue': 10000, 'average-order-value': 1000,
    'lead-response-rate': 40, 'prospect-response-rate': 20,
  };
  const ids = [...Object.keys(defaults), 'lead-response-value', 'prospect-response-value', 'campaign-form'];
  for (const name of ['customers', 'leads', 'prospects']) {
    ids.push(`${name}-count`, `${name}-percentage`, `${name}-meter`);
  }
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

test('the complete funnel initializes and responds to every formula input', () => {
  const { get, change } = setupPage();
  assert.equal(get('customers-count').textContent, '10');
  assert.equal(get('leads-count').textContent, '25');
  assert.equal(get('prospects-count').textContent, '125');
  assert.equal(get('customers-percentage').textContent, '8%');
  assert.equal(get('leads-meter').value, 20);
  assert.equal(get('prospects-meter').value, 100);
  change('total-revenue', 20000);
  assert.equal(get('prospects-count').textContent, '250');
  change('average-order-value', 2000);
  assert.equal(get('prospects-count').textContent, '125');
  change('lead-response-rate', 50);
  assert.equal(get('leads-count').textContent, '20');
  assert.equal(get('prospects-count').textContent, '100');
  assert.equal(get('customers-percentage').textContent, '10%');
  change('prospect-response-rate', 50);
  assert.equal(get('prospects-count').textContent, '40');
  assert.equal(get('customers-count').textContent, '10');
  assert.equal(get('leads-count').textContent, '20');
  assert.equal(get('customers-percentage').textContent, '25%');
  assert.equal(get('leads-meter').value, 50);
  assert.equal(get('prospect-response-value').textContent, '50.00%');
  assert.equal(get('prospect-response-rate').style['--rate'], '50%');
  assert.equal(get('prospect-response-rate').attributes['aria-valuetext'], '50%');
});

test('invalid upstream inputs and zero response rates clear stale results and recover', () => {
  const { get, change } = setupPage();
  change('prospect-response-rate', 0);
  assert.equal(get('prospects-count').textContent, '\u2014');
  assert.equal(get('leads-count').textContent, '25');
  assert.equal(get('prospects-percentage').textContent, '\u2014');
  assert.equal(get('prospects-meter').value, 0);
  assert.equal(get('prospect-response-rate').attributes['aria-invalid'], 'true');
  assert.match(get('prospects-count').title, /above 0%/);
  change('prospect-response-rate', 20);
  assert.equal(get('prospects-count').textContent, '125');
  assert.equal(get('prospect-response-rate').attributes['aria-invalid'], 'false');
  change('lead-response-rate', 0);
  assert.equal(get('leads-count').textContent, '\u2014');
  assert.equal(get('prospects-count').textContent, '\u2014');
  change('lead-response-rate', 40);
  change('average-order-value', NaN, false);
  assert.equal(get('prospects-count').textContent, '\u2014');
  change('average-order-value', 1000);
  assert.equal(get('prospects-count').textContent, '125');
  assert.equal(get('customers-percentage').textContent, '8%');
});

test('a zero revenue target produces zero counts and meters even with zero rates', () => {
  const { get, change } = setupPage();
  change('total-revenue', 0);
  change('lead-response-rate', 0);
  change('prospect-response-rate', 0);
  for (const name of ['customers', 'leads', 'prospects']) {
    assert.equal(get(`${name}-count`).textContent, '0');
    assert.equal(get(`${name}-percentage`).textContent, '0%');
    assert.equal(get(`${name}-meter`).value, 0);
  }
  assert.equal(get('prospect-response-rate').attributes['aria-invalid'], 'false');
  let prevented = false;
  get('campaign-form').listeners.submit.forEach(handler => handler({ preventDefault() { prevented = true; } }));
  assert.ok(prevented);
});
