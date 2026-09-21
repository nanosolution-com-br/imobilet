export const PAYMENT_RECEIPTS_BUCKET = 'payment-receipts';
export const PAYMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const PAYMENT_RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

const extensionByMimeType = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const allowedExtensions = new Set(Object.values(extensionByMimeType));

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validatePaymentReceipt = (file) => {
  if (!file) return null;
  if (!extensionByMimeType[file.type]) {
    return 'Use um comprovante PDF, JPG, PNG ou WEBP.';
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return 'O arquivo do comprovante está vazio ou inválido.';
  }
  if (file.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return 'O comprovante deve ter no máximo 10 MB.';
  }
  return null;
};

export const buildPaymentReceiptPath = ({
  userId,
  contractId,
  installmentId,
  file,
  objectId = crypto.randomUUID(),
}) => {
  const identifiers = [userId, contractId, installmentId, objectId];
  if (identifiers.some(identifier => !uuidPattern.test(identifier || ''))) {
    throw new Error('Não foi possível criar um caminho seguro para o comprovante.');
  }

  const extension = extensionByMimeType[file?.type];
  if (!extension) {
    throw new Error('Tipo de comprovante não permitido.');
  }

  return `${userId}/${contractId}/${installmentId}/${objectId}.${extension}`;
};

export const getReceiptDownloadName = (receiptPath) => {
  const extension = receiptPath?.split('.').pop()?.toLowerCase();
  return allowedExtensions.has(extension)
    ? `comprovante-pagamento.${extension}`
    : 'comprovante-pagamento.arquivo';
};
