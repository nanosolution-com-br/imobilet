import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Download,
  Loader2,
  Receipt,
  User,
  WalletCards,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import {
  getReceiptDownloadName,
  PAYMENT_RECEIPTS_BUCKET,
} from '@/lib/paymentReceipts';
import { useToast } from '@/components/ui/use-toast';
import ManualPaymentDialog from '@/components/receivables/ManualPaymentDialog';
import {
  contractStatusLabels,
  calculateInstallmentStatus,
  formatCurrency,
  formatDate,
  getInstallmentBadgeClass,
  installmentStatusLabels,
  isMissingReceivablesSchema,
  paymentMethodLabels,
  safeBuyerName,
  safePropertyTitle,
} from '@/lib/receivables';

const SalesContractDetails = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(null);

  const fetchContract = useCallback(async () => {
    try {
      setLoading(true);
      setSchemaMissing(false);

      const { data, error } = await supabase
        .from('sales_contracts')
        .select(`
          *,
          property:properties(id, title, code, custom_id, status, block, fraction, price),
          buyer:buyers(id, full_name, name),
          installments(*),
          payments(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (isMissingReceivablesSchema(error)) {
          setSchemaMissing(true);
          setContract(null);
          return;
        }
        throw error;
      }

      setContract({
        ...data,
        installments: (data.installments || [])
          .map((installment) => ({
            ...installment,
            effective_status: calculateInstallmentStatus({
              balance: installment.balance,
              paidAmount: installment.paid_amount,
              dueDate: installment.due_date,
              currentStatus: installment.status,
            }),
          }))
          .sort((a, b) => Number(a.installment_number) - Number(b.installment_number)),
        payments: (data.payments || []).sort((a, b) => String(b.payment_date || '').localeCompare(String(a.payment_date || ''))),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar contrato',
        description: error.message || 'Não foi possível consultar os detalhes da venda.',
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  const summary = useMemo(() => {
    const installments = contract?.installments || [];
    return installments.reduce((acc, item) => {
      acc.original += Number(item.original_amount || 0);
      acc.adjusted += Number(item.adjusted_amount || 0);
      acc.paid += Number(item.paid_amount || 0);
      acc.balance += Number(item.balance || 0);
      const status = item.effective_status || item.status;
      if (status === 'overdue') acc.overdue += Number(item.balance || 0);
      return acc;
    }, {
      original: 0,
      adjusted: 0,
      paid: 0,
      balance: 0,
      overdue: 0,
    });
  }, [contract]);

  const openPaymentDialog = (installment) => {
    setSelectedInstallment(installment);
    setPaymentDialogOpen(true);
  };

  const downloadReceipt = async (receiptPath) => {
    try {
      setDownloadingReceipt(receiptPath);
      const { data, error } = await supabase.storage
        .from(PAYMENT_RECEIPTS_BUCKET)
        .download(receiptPath);

      if (error) throw error;

      const objectUrl = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = getReceiptDownloadName(receiptPath);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao baixar comprovante',
        description: error.message || 'Não foi possível acessar o arquivo privado.',
      });
    } finally {
      setDownloadingReceipt(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
          Carregando contrato...
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Detalhes do Contrato - Imobilet</title>
        <meta name="description" content="Detalhes da venda e recebimento de parcelas" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <Link to="/financeiro/a-receber">
            <Button variant="ghost" className="mb-6 text-slate-700 hover:bg-slate-100">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para contas a receber
            </Button>
          </Link>

          {schemaMissing || !contract ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <div>
                  <h1 className="font-bold">Contrato indisponível</h1>
                  <p className="text-sm mt-1">
                    A migração de recebimentos ainda não foi aplicada ou o contrato não foi encontrado.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-700">Contrato de venda</p>
                    <h1 className="text-3xl font-bold text-slate-950 mt-1">{contract.contract_number}</h1>
                    <p className="text-slate-600 mt-2">
                      Venda em {formatDate(contract.sale_date)} · {contractStatusLabels[contract.status] || contract.status}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800 border border-emerald-100">
                    <p className="text-sm font-medium">Valor total</p>
                    <p className="text-2xl font-bold">{formatCurrency(contract.total_amount)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-bold text-slate-950 flex items-center mb-4">
                    <Building2 className="h-5 w-5 mr-2 text-emerald-600" />
                    Imóvel
                  </h2>
                  <p className="text-lg font-semibold text-slate-900">{safePropertyTitle(contract.property)}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    ID {contract.property?.custom_id || contract.property?.code || '-'} · {contract.property?.block || '-'} {contract.property?.fraction || ''}
                  </p>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-bold text-slate-950 flex items-center mb-4">
                    <User className="h-5 w-5 mr-2 text-emerald-600" />
                    Comprador
                  </h2>
                  <p className="text-lg font-semibold text-slate-900">{safeBuyerName(contract.buyer)}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Dados de contato não exibidos neste módulo financeiro.
                  </p>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-bold text-slate-950 flex items-center mb-4">
                    <Calendar className="h-5 w-5 mr-2 text-emerald-600" />
                    Condições
                  </h2>
                  <p className="text-sm text-slate-600">Entrada: <span className="font-semibold text-slate-900">{formatCurrency(contract.down_payment_amount)}</span></p>
                  <p className="text-sm text-slate-600 mt-1">
                    {contract.installments_count}x de <span className="font-semibold text-slate-900">{formatCurrency(contract.installment_amount)}</span>
                  </p>
                  <p className="text-sm text-slate-600 mt-1">1ª parcela: {formatDate(contract.first_installment_date)}</p>
                </section>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Valor atualizado</p>
                  <p className="text-xl font-bold text-slate-950">{formatCurrency(summary.adjusted)}</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Recebido</p>
                  <p className="text-xl font-bold text-emerald-700">{formatCurrency(summary.paid)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Saldo</p>
                  <p className="text-xl font-bold text-slate-950">{formatCurrency(summary.balance)}</p>
                </div>
                <div className="rounded-lg border border-rose-100 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Vencido</p>
                  <p className="text-xl font-bold text-rose-700">{formatCurrency(summary.overdue)}</p>
                </div>
              </div>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
                <div className="p-5 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-950 flex items-center">
                    <WalletCards className="h-5 w-5 mr-2 text-emerald-600" />
                    Parcelas
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Parcela</th>
                        <th className="px-5 py-3">Vencimento</th>
                        <th className="px-5 py-3">Original</th>
                        <th className="px-5 py-3">Atualizado</th>
                        <th className="px-5 py-3">Pago</th>
                        <th className="px-5 py-3">Saldo</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(contract.installments || []).map((item) => (
                        <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-50">
                          <td className="px-5 py-4 font-semibold text-slate-900">{item.installment_number}</td>
                          <td className="px-5 py-4 text-slate-700">{formatDate(item.due_date)}</td>
                          <td className="px-5 py-4 text-slate-700">{formatCurrency(item.original_amount)}</td>
                          <td className="px-5 py-4 text-slate-700">{formatCurrency(item.adjusted_amount)}</td>
                          <td className="px-5 py-4 text-emerald-700 font-semibold">{formatCurrency(item.paid_amount)}</td>
                          <td className="px-5 py-4 text-slate-950 font-bold">{formatCurrency(item.balance)}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getInstallmentBadgeClass(item.effective_status)}`}>
                              {installmentStatusLabels[item.effective_status] || item.effective_status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-500"
                              disabled={['paid', 'cancelled', 'renegotiated'].includes(item.effective_status)}
                              onClick={() => openPaymentDialog(item)}
                            >
                              Registrar pagamento
                            </Button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-200">
                  <h2 className="text-xl font-bold text-slate-950 flex items-center">
                    <Receipt className="h-5 w-5 mr-2 text-emerald-600" />
                    Histórico de pagamentos
                  </h2>
                </div>
                {(contract.payments || []).length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    Nenhum pagamento registrado.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {contract.payments.map((payment) => (
                      <div key={payment.id} className="p-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">{formatCurrency(payment.paid_amount)}</p>
                          <p className="text-sm text-slate-500">
                            {formatDate(payment.payment_date)} · {paymentMethodLabels[payment.payment_method] || payment.payment_method}
                          </p>
                          {payment.notes ? <p className="text-sm text-slate-600 mt-1">{payment.notes}</p> : null}
                        </div>
                        {payment.receipt_path ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => downloadReceipt(payment.receipt_path)}
                            disabled={downloadingReceipt === payment.receipt_path}
                            className="border-slate-300 text-slate-700"
                          >
                            {downloadingReceipt === payment.receipt_path ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Baixar comprovante
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        <Footer />
      </div>

      <ManualPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        installment={selectedInstallment}
        contractId={contract?.id}
        onPaymentSaved={fetchContract}
      />
    </>
  );
};

export default SalesContractDetails;
