import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateInstallmentStatus,
  generateInstallmentsSchedule,
  isMissingReceivablesSchema,
} from '../src/lib/receivables.js';
import {
  buildPaymentReceiptPath,
  getReceiptDownloadName,
  validatePaymentReceipt,
} from '../src/lib/paymentReceipts.js';

const schedule = generateInstallmentsSchedule({
  installmentsCount: 3,
  installmentAmount: 1250.5,
  firstInstallmentDate: '2024-01-31',
});

assert.equal(schedule.length, 3);
assert.deepEqual(schedule.map(item => item.due_date), ['2024-01-31', '2024-02-29', '2024-03-31']);
assert.equal(schedule[0].balance, 1250.5);

assert.equal(generateInstallmentsSchedule({
  installmentsCount: 1.5,
  installmentAmount: 100,
  firstInstallmentDate: '2026-01-01',
}).length, 0);

assert.equal(generateInstallmentsSchedule({
  installmentsCount: 601,
  installmentAmount: 100,
  firstInstallmentDate: '2026-01-01',
}).length, 0);

assert.equal(calculateInstallmentStatus({
  balance: 0,
  paidAmount: 100,
  dueDate: '2026-01-01',
  currentStatus: 'partial',
  referenceDate: '2026-02-01',
}), 'paid');

assert.equal(calculateInstallmentStatus({
  balance: 50,
  paidAmount: 50,
  dueDate: '2026-01-01',
  currentStatus: 'partial',
  referenceDate: '2026-02-01',
}), 'overdue');

assert.equal(calculateInstallmentStatus({
  balance: 50,
  paidAmount: 50,
  dueDate: '2026-03-01',
  currentStatus: 'partial',
  referenceDate: '2026-02-01',
}), 'partial');

assert.equal(calculateInstallmentStatus({
  balance: 50,
  paidAmount: 0,
  dueDate: '2026-01-01',
  currentStatus: 'cancelled',
  referenceDate: '2026-02-01',
}), 'cancelled');

assert.equal(isMissingReceivablesSchema({
  code: 'PGRST202',
  message: 'Could not find the function public.create_sales_contract_with_installments',
}), true);

const receiptFile = { type: 'application/pdf', size: 1024 };
const receiptPath = buildPaymentReceiptPath({
  userId: '11111111-1111-4111-8111-111111111111',
  contractId: '22222222-2222-4222-8222-222222222222',
  installmentId: '33333333-3333-4333-8333-333333333333',
  objectId: '44444444-4444-4444-8444-444444444444',
  file: receiptFile,
});

assert.equal(receiptPath, '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.pdf');
assert.equal(validatePaymentReceipt(receiptFile), null);
assert.match(validatePaymentReceipt({ type: 'text/html', size: 200 }), /PDF/);
assert.match(validatePaymentReceipt({ type: 'image/png', size: 11 * 1024 * 1024 }), /10 MB/);
assert.equal(getReceiptDownloadName(receiptPath), 'comprovante-pagamento.pdf');

const storagePolicies = readFileSync(
  new URL('../docs/supabase-payment-receipts-storage.sql', import.meta.url),
  'utf8',
);
assert.match(storagePolicies, /bucket_id = 'payment-receipts'/);
assert.match(storagePolicies, /owner_id = \(select auth\.uid\(\)::text\)/);
assert.doesNotMatch(storagePolicies, /for update/i);
assert.doesNotMatch(storagePolicies, /to service_role/i);

console.log('Regras de contas a receber: validações concluídas com sucesso.');
