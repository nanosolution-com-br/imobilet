import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2, Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  buildPaymentReceiptPath,
  PAYMENT_RECEIPT_ACCEPT,
  PAYMENT_RECEIPTS_BUCKET,
  validatePaymentReceipt,
} from '@/lib/paymentReceipts';
import {
  formatCurrency,
  getTodayISO,
  paymentMethodLabels,
} from '@/lib/receivables';

const paymentMethods = Object.entries(paymentMethodLabels);

const ManualPaymentDialog = ({ open, onOpenChange, installment, contractId, onPaymentSaved }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [formData, setFormData] = useState({
    payment_date: getTodayISO(),
    paid_amount: '',
    payment_method: 'pix',
    notes: '',
  });

  useEffect(() => {
    if (open && installment) {
      setFormData({
        payment_date: getTodayISO(),
        paid_amount: String(Number(installment.balance || installment.adjusted_amount || 0).toFixed(2)),
        payment_method: 'pix',
        notes: '',
      });
      setReceiptFile(null);
    }
  }, [installment, open]);

  const projected = useMemo(() => {
    const currentPaid = Number(installment?.paid_amount || 0);
    const entered = Number(formData.paid_amount || 0);
    const adjusted = Number(installment?.adjusted_amount || installment?.original_amount || 0);
    const nextPaid = currentPaid + entered;
    return {
      nextPaid,
      nextBalance: Math.max(adjusted - nextPaid, 0),
    };
  }, [formData.paid_amount, installment]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!installment || !contractId) return;

    const paidAmount = Number(formData.paid_amount);
    if (!formData.payment_date) {
      toast({ variant: 'destructive', title: 'Informe a data do pagamento.' });
      return;
    }
    if (!paidAmount || paidAmount <= 0) {
      toast({ variant: 'destructive', title: 'Informe um valor de pagamento válido.' });
      return;
    }
    if (paidAmount > Number(installment.balance || 0)) {
      toast({ variant: 'destructive', title: 'O pagamento não pode ser maior que o saldo da parcela.' });
      return;
    }

    const receiptValidationError = validatePaymentReceipt(receiptFile);
    if (receiptValidationError) {
      toast({ variant: 'destructive', title: receiptValidationError });
      return;
    }
    if (receiptFile && !user?.id) {
      toast({ variant: 'destructive', title: 'Sua sessão expirou. Entre novamente antes de anexar o comprovante.' });
      return;
    }

    let uploadedReceiptPath = null;
    let paymentRecorded = false;

    try {
      setSaving(true);

      if (receiptFile) {
        uploadedReceiptPath = buildPaymentReceiptPath({
          userId: user.id,
          contractId,
          installmentId: installment.id,
          file: receiptFile,
        });

        const { error: uploadError } = await supabase.storage
          .from(PAYMENT_RECEIPTS_BUCKET)
          .upload(uploadedReceiptPath, receiptFile, {
            cacheControl: '3600',
            contentType: receiptFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;
      }

      const { error: paymentError } = await supabase.rpc('register_manual_installment_payment', {
        installment_uuid: installment.id,
        payment_date_value: formData.payment_date,
        paid_amount_value: paidAmount,
        payment_method_value: formData.payment_method,
        receipt_path_value: uploadedReceiptPath,
        notes_value: formData.notes.trim() || null,
      });

      if (paymentError) throw paymentError;
      paymentRecorded = true;

      toast({
        title: 'Pagamento registrado',
        description: 'A parcela foi atualizada com sucesso.',
      });

      onPaymentSaved?.();
      onOpenChange(false);
    } catch (error) {
      if (uploadedReceiptPath && !paymentRecorded) {
        await supabase.storage.from(PAYMENT_RECEIPTS_BUCKET).remove([uploadedReceiptPath]);
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar pagamento',
        description: error.message || 'Não foi possível salvar o pagamento.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar pagamento manual</DialogTitle>
          <DialogDescription>
            Parcela {installment?.installment_number || '-'} com saldo de {formatCurrency(installment?.balance || 0)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payment_date">Data do pagamento</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(event) => setFormData((prev) => ({ ...prev, payment_date: event.target.value }))}
                disabled={saving}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="paid_amount">Valor pago</Label>
              <Input
                id="paid_amount"
                type="number"
                min="0"
                step="0.01"
                value={formData.paid_amount}
                onChange={(event) => setFormData((prev) => ({ ...prev, paid_amount: event.target.value }))}
                disabled={saving}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="payment_method">Forma de pagamento</Label>
            <select
              id="payment_method"
              value={formData.payment_method}
              onChange={(event) => setFormData((prev) => ({ ...prev, payment_method: event.target.value }))}
              disabled={saving}
              className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {paymentMethods.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="receipt_path">Comprovante/anexo opcional</Label>
            <Input
              key={`${installment?.id || 'none'}-${open ? 'open' : 'closed'}`}
              id="receipt_path"
              type="file"
              accept={PAYMENT_RECEIPT_ACCEPT}
              onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
              disabled={saving}
              className="mt-2 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold"
            />
            {receiptFile ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                <FileCheck2 className="h-4 w-4" />
                <span className="truncate">{receiptFile.name}</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <Paperclip className="h-4 w-4" />
                <span>Nenhum comprovante selecionado</span>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              PDF, JPG, PNG ou WEBP, com até 10 MB. O arquivo será armazenado em área privada.
            </p>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
              disabled={saving}
              className="mt-2 min-h-24"
              placeholder="Ex: pagamento parcial, acordo, referência do recibo..."
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Saldo após o lançamento: <span className="font-bold text-slate-950">{formatCurrency(projected.nextBalance)}</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Registrar pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManualPaymentDialog;
