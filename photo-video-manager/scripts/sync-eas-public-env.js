const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const values = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
};
const variableNames = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
];

for (const name of variableNames) {
  const value = values[name];
  if (!value) {
    throw new Error(`${name} is missing from .env or .env.local.`);
  }

  const result = spawnSync('npx', [
    'eas-cli',
    'env:create',
    'production',
    '--name',
    name,
    '--value',
    value,
    '--visibility',
    'sensitive',
    '--scope',
    'project',
    '--force',
    '--non-interactive',
  ], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(`Failed to start EAS CLI for ${name}: ${result.error.message}`);
    }
    process.exit(result.status ?? 1);
  }
}

console.log('EAS production public environment variables are configured.');
