const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const destination = path.join(root, 'dist');
const files = ['index.html', 'style.css', 'customers.js', 'leads.js', 'prospects.js', 'graph.js'];

fs.mkdirSync(destination, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(destination, file));
}
console.log(`Prepared ${files.length} website files in dist/.`);
