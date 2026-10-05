const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
// Only these public assets are published. The old SQLite database stays local.
fs.copyFileSync(path.join(root, 'index.html'), path.join(output, 'index.html'));
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),
  path.join(output, 'assets/vendor/supabase.js'));
console.log('Fraga Sucatas 2.0.0 built in dist');
