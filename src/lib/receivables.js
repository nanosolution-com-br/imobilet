export const paymentMethodLabels = {
  cash: 'Dinheiro',
  pix: 'Pix',
  bank_transfer: 'Transferência bancária',
  bank_slip: 'Boleto',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  other: 'Outro',
};

export const installmentStatusLabels = {
  open: 'Em aberto',
  overdue: 'Vencida',
  partial: 'Parcial',
  paid: 'Paga',
  cancelled: 'Cancelada',
  renegotiated: 'Renegociada',
};

export const contractStatusLabels = {
  draft: 'Rascunho',
  active: 'Ativo',
  settled: 'Quitado',
  cancelled: 'Cancelado',
  renegotiated: 'Renegociado',
};

export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const MAX_INSTALLMENTS_COUNT = 600;

export const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

export const formatDate = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
};

export const getTodayISO = () => new Date().toISOString().slice(0, 10);

export const addMonths = (dateValue, monthsToAdd) => {
  const date = new Date(`${dateValue}T12:00:00`);
  const originalDay = date.getDate();
  date.setMonth(date.getMonth() + monthsToAdd);

  if (date.getDate() < originalDay) {
    date.setDate(0);
  }

  return date.toISOString().slice(0, 10);
};

export const generateInstallmentsSchedule = ({
  installmentsCount,
  installmentAmount,
  firstInstallmentDate,
}) => {
  const count = Number(installmentsCount) || 0;
  const amount = Number(installmentAmount) || 0;
  const firstDueDate = new Date(`${firstInstallmentDate}T12:00:00`);

  if (!Number.isInteger(count)
    || count <= 0
    || count > MAX_INSTALLMENTS_COUNT
    || !Number.isFinite(amount)
    || amount <= 0
    || !firstInstallmentDate
    || Number.isNaN(firstDueDate.getTime())) {
    return [];
  }

  return Array.from({ length: count }).map((_, index) => ({
    installment_number: index + 1,
    due_date: addMonths(firstInstallmentDate, index),
    original_amount: amount,
    adjusted_amount: amount,
    paid_amount: 0,
    balance: amount,
    status: 'open',
    paid_at: null,
  }));
};

export const calculateInstallmentStatus = ({
  balance,
  paidAmount = 0,
  dueDate,
  currentStatus,
  referenceDate = getTodayISO(),
}) => {
  if (['cancelled', 'renegotiated'].includes(currentStatus)) return currentStatus;
  if (Number(balance) <= 0) return 'paid';

  const today = new Date(`${referenceDate}T12:00:00`);
  const due = new Date(`${dueDate}T12:00:00`);

  if (Number.isNaN(today.getTime()) || Number.isNaN(due.getTime())) {
    return Number(paidAmount) > 0 ? 'partial' : 'open';
  }
  if (due < today) return 'overdue';
  if (Number(paidAmount) > 0) return 'partial';
  return 'open';
};

export const deriveInstallmentStatus = (installment, nextPaidAmount = installment?.paid_amount || 0) => {
  const adjusted = Number(installment?.adjusted_amount ?? installment?.original_amount ?? 0);
  const paid = Number(nextPaidAmount) || 0;
  const balance = Math.max(adjusted - paid, 0);

  return calculateInstallmentStatus({
    balance,
    paidAmount: paid,
    dueDate: installment?.due_date,
    currentStatus: installment?.status,
  });
};

export const getInstallmentBadgeClass = (status) => {
  const classes = {
    open: 'bg-sky-50 text-sky-700 border-sky-200',
    overdue: 'bg-rose-50 text-rose-700 border-rose-200',
    partial: 'bg-amber-50 text-amber-700 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
    renegotiated: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  return classes[status] || classes.open;
};

export const isMissingReceivablesSchema = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST202'
    || error?.code === 'PGRST205'
    || message.includes('sales_contracts')
    || message.includes('installments')
    || message.includes('payments')
    || message.includes('create_sales_contract_with_installments')
    || message.includes('does not exist')
    || message.includes('could not find');
};

export const safeBuyerName = (buyer) => (
  buyer?.full_name
  || buyer?.name
  || buyer?.buyer_name
  || buyer?.nome
  || 'Comprador não informado'
);

export const safePropertyTitle = (property) => (
  property?.title
  || property?.name
  || property?.custom_id
  || property?.code
  || 'Imóvel não informado'
);
