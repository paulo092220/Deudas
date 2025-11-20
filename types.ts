
export enum Currency {
  CUP = 'CUP',
  USD = 'USD',
  USDT = 'USDT',
  ZELLE = 'ZELLE',
  EUR = 'EUR'
}

export type DebtType = 'MONETARY' | 'INVENTORY';

export interface Product {
  id: string;
  name: string;
}

export interface Payment {
  id: string;
  debtId: string;
  amountPaidOriginal: number; // The amount entered in the currency used
  currency: Currency;
  exchangeRate: number; // The rate used at the moment of payment
  amountPaidCUP: number; // Calculated CUP value
  quantityPaid?: number; // Specific for INVENTORY debts (how many boxes were paid)
  date: string;
  note?: string;
}

export interface Debt {
  id: string;
  clientId: string;
  type: DebtType; // 'MONETARY' or 'INVENTORY'
  
  productId: string; // Reference to a product
  productNameSnapshot: string; // In case product is deleted, keep name
  description?: string;
  
  // Monetary Fields
  originalAmount: number;
  originalCurrency: Currency;
  exchangeRate: number; // Rate at the time of debt creation
  totalAmountCUP: number; // The debt value standardized to CUP
  remainingAmountCUP: number;

  // Inventory Fields
  initialQuantity?: number; // Total boxes owed initially
  remainingQuantity?: number; // Boxes left to pay
  
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  date: string;
  payments: Payment[];
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  debts: Debt[];
}

export type ViewState = 'DASHBOARD' | 'CLIENT_LIST' | 'CLIENT_DETAIL' | 'SETTINGS';

export interface AppState {
  clients: Client[];
  products: Product[];
}