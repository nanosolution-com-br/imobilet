import assert from 'node:assert/strict';
import { inspectSupabaseConfiguration } from '../src/lib/supabaseConfiguration.js';

const publishableKey = `sb_publishable_${'a'.repeat(32)}`;
const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const legacyKey = (role) => `${jwtPart({ alg: 'HS256', typ: 'JWT' })}.${jwtPart({ role, exp: 9999999999 })}.${'a'.repeat(64)}`;
const legacyAnonKey = legacyKey('anon');

assert.equal(inspectSupabaseConfiguration({}).error.code, 'supabase_config_missing');

assert.equal(inspectSupabaseConfiguration({
  url: 'https://seu-projeto.supabase.co',
  publishableKey,
}).error.code, 'supabase_config_invalid_url');

assert.equal(inspectSupabaseConfiguration({
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'chave-invalida',
}).error.code, 'supabase_config_invalid_key');

assert.equal(inspectSupabaseConfiguration({
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey,
}).isValid, true);

assert.equal(inspectSupabaseConfiguration({
  url: 'https://imobilet.supabase.co',
  publishableKey,
}).error.code, 'supabase_config_invalid_url');

assert.equal(inspectSupabaseConfiguration({
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  legacyAnonKey: legacyKey('service_role'),
}).error.code, 'supabase_config_invalid_key');

assert.equal(inspectSupabaseConfiguration({
  url: 'http://127.0.0.1:54321',
  legacyAnonKey,
}).isValid, true);

console.log('Configuração do Supabase: validações concluídas com sucesso.');
