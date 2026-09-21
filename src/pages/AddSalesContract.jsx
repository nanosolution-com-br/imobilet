import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileSignature, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import {
  formatCurrency,
  generateInstallmentsSchedule,
  isMissingReceivablesSchema,
  safeBuyerName,
  safePropertyTitle,
} from '@/lib/receivables';

const AddSalesContract = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [buyers, setBuyers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [formData, setFormData] = useState({
    buyer_id: '',
    property_id: '',
    contract_number: '',
    sale_date: new Date().toISOString().slice(0, 10),
    total_amount: '',
    down_payment_amount: '',
    installments_count: '',
    installment_amount: '',
    first_installment_date: '',
    notes: '',
  });

  const fetchOptions = useCallback(async () => {
    try {
      setLoadingOptions(true);
      const [buyersResult, propertiesResult] = await Promise.all([
        supabase.from('buyers').select('id, property_id, full_name, name').order('full_name'),
        supabase.from('properties').select('id, title, code, custom_id, price, signal_value, installments_count, installment_value, first_installment_date, status').order('title'),
      ]);

      if (buyersResult.error) throw buyersResult.error;
      if (propertiesResult.error) throw propertiesResult.error;

      setBuyers((buyersResult.data || []).filter((buyer) => buyer.property_id));
      setProperties(propertiesResult.data || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados',
        description: error.message || 'Não foi possível carregar compradores e imóveis.',
      });
    } finally {
      setLoadingOptions(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const propertyById = useMemo(() => {
    return properties.reduce((acc, property) => {
      acc[property.id] = property;
      return acc;
    }, {});
  }, [properties]);

  const selectedBuyer = buyers.find((buyer) => buyer.id === formData.buyer_id);
  const selectedProperty = propertyById[formData.property_id];
  const previewInstallments = generateInstallmentsSchedule({
    installmentsCount: formData.installments_count,
    installmentAmount: formData.installment_amount,
    firstInstallmentDate: formData.first_installment_date,
  });

  const handleBuyerChange = (buyerId) => {
    const buyer = buyers.find((item) => item.id === buyerId);
    const property = buyer?.property_id ? propertyById[buyer.property_id] : null;

    setFormData((prev) => ({
      ...prev,
      buyer_id: buyerId,
      property_id: buyer?.property_id || '',
      total_amount: property?.price ? String(property.price) : prev.total_amount,
      down_payment_amount: property?.signal_value ? String(property.signal_value) : prev.down_payment_amount,
      installments_count: property?.installments_count ? String(property.installments_count) : prev.installments_count,
      installment_amount: property?.installment_value ? String(property.installment_value) : prev.installment_amount,
      first_installment_date: property?.first_installment_date || prev.first_installment_date,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.buyer_id || !formData.property_id) {
      toast({ variant: 'destructive', title: 'Selecione um comprador com imóvel vinculado.' });
      return;
    }
    if (!formData.contract_number.trim()) {
      toast({ variant: 'destructive', title: 'Informe o número do contrato.' });
      return;
    }
    if (previewInstallments.length === 0) {
      toast({ variant: 'destructive', title: 'Informe quantidade, valor e data da primeira parcela.' });
      return;
    }

    try {
      setLoading(true);
      setSchemaMissing(false);

      const { data: contractId, error: contractError } = await supabase
        .rpc('create_sales_contract_with_installments', {
          property_uuid: formData.property_id,
          buyer_uuid: formData.buyer_id,
          contract_number_value: formData.contract_number.trim(),
          sale_date_value: formData.sale_date,
          total_amount_value: Number(formData.total_amount || 0),
          down_payment_amount_value: Number(formData.down_payment_amount || 0),
          installments_count_value: Number(formData.installments_count || 0),
          installment_amount_value: Number(formData.installment_amount || 0),
          first_installment_date_value: formData.first_installment_date,
          notes_value: formData.notes.trim() || null,
        });

      if (contractError) {
        if (isMissingReceivablesSchema(contractError)) {
          setSchemaMissing(true);
          return;
        }
        throw contractError;
      }

      toast({
        title: 'Contrato criado',
        description: 'As parcelas foram geradas automaticamente.',
      });

      navigate(`/financeiro/a-receber/contratos/${contractId}`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar contrato',
        description: error.message || 'Não foi possível salvar o contrato de venda.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Novo Contrato - Imobilet</title>
        <meta name="description" content="Cadastro de contrato de venda e geração de parcelas" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <Link to="/financeiro/a-receber">
            <Button variant="ghost" className="mb-6 text-slate-700 hover:bg-slate-100">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para contas a receber
            </Button>
          </Link>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-sm font-semibold text-emerald-700 flex items-center">
                <FileSignature className="h-4 w-4 mr-2" />
                Venda de imóvel
              </p>
              <h1 className="text-3xl font-bold text-slate-950 mt-1">Novo contrato</h1>
              <p className="text-slate-600 mt-2">
                Selecione um comprador já vinculado a um imóvel para gerar as parcelas automaticamente.
              </p>
            </div>

            {schemaMissing && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                A migração de recebimentos ainda não foi aplicada. Use `docs/supabase-receivables-schema.sql`.
              </div>
            )}

            {loadingOptions ? (
              <div className="py-16 flex items-center justify-center text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mr-2" />
                Carregando compradores...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="buyer_id">Comprador com imóvel vinculado</Label>
                    <select
                      id="buyer_id"
                      value={formData.buyer_id}
                      onChange={(event) => handleBuyerChange(event.target.value)}
                      className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">Selecione</option>
                      {buyers.map((buyer) => (
                        <option key={buyer.id} value={buyer.id}>
                          {safeBuyerName(buyer)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>Imóvel vinculado</Label>
                    <Input
                      disabled
                      value={selectedProperty ? safePropertyTitle(selectedProperty) : 'Selecione um comprador'}
                      className="mt-2 bg-slate-100 text-slate-600"
                    />
                  </div>

                  <div>
                    <Label htmlFor="contract_number">Número do contrato</Label>
                    <Input
                      id="contract_number"
                      value={formData.contract_number}
                      onChange={(event) => setFormData((prev) => ({ ...prev, contract_number: event.target.value }))}
                      className="mt-2"
                      placeholder="Ex: LT-2026-001"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sale_date">Data da venda</Label>
                    <Input
                      id="sale_date"
                      type="date"
                      value={formData.sale_date}
                      onChange={(event) => setFormData((prev) => ({ ...prev, sale_date: event.target.value }))}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="total_amount">Valor total</Label>
                    <Input
                      id="total_amount"
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={(event) => setFormData((prev) => ({ ...prev, total_amount: event.target.value }))}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="down_payment_amount">Entrada / sinal</Label>
                    <Input
                      id="down_payment_amount"
                      type="number"
                      step="0.01"
                      value={formData.down_payment_amount}
                      onChange={(event) => setFormData((prev) => ({ ...prev, down_payment_amount: event.target.value }))}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="installments_count">Quantidade de parcelas</Label>
                    <Input
                      id="installments_count"
                      type="number"
                      min="1"
                      value={formData.installments_count}
                      onChange={(event) => setFormData((prev) => ({ ...prev, installments_count: event.target.value }))}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="installment_amount">Valor da parcela</Label>
                    <Input
                      id="installment_amount"
                      type="number"
                      step="0.01"
                      value={formData.installment_amount}
                      onChange={(event) => setFormData((prev) => ({ ...prev, installment_amount: event.target.value }))}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="first_installment_date">Data da primeira parcela</Label>
                    <Input
                      id="first_installment_date"
                      type="date"
                      value={formData.first_installment_date}
                      onChange={(event) => setFormData((prev) => ({ ...prev, first_installment_date: event.target.value }))}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
                    className="mt-2 min-h-24"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h2 className="font-bold text-slate-950 mb-2">Prévia das parcelas</h2>
                  <p className="text-sm text-slate-600">
                    {previewInstallments.length} parcela(s) de {formatCurrency(formData.installment_amount)}.
                  </p>
                  {previewInstallments.length > 0 && (
                    <p className="text-sm text-slate-600 mt-1">
                      Primeira: {previewInstallments[0].due_date} · Última: {previewInstallments[previewInstallments.length - 1].due_date}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Criar contrato e parcelas
                  </Button>
                  <Link to="/financeiro/a-receber">
                    <Button type="button" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100">
                      Cancelar
                    </Button>
                  </Link>
                </div>
              </form>
            )}
          </motion.div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default AddSalesContract;
