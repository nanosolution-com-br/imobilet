import assert from 'node:assert/strict';
import {
  calculateInstallmentStatus,
  generateInstallmentsSchedule,
  isMissingReceivablesSchema,
} from '../src/lib/receivables.js';

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

console.log('Regras de contas a receber: validações concluídas com sucesso.');
