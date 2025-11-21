
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Users, ArrowLeft, DollarSign, AlertCircle, Sparkles, Wallet, 
  Box, Trash2, History, LayoutDashboard, Package, Download, Upload, 
  RefreshCw, AlertTriangle, HardDrive, CheckCircle, XCircle, Copy, 
  Calculator, Filter, X, Info, Save
} from 'lucide-react';
import { Client, Product, Debt, Currency, Payment, ViewState, DebtType } from './types';
import { Button } from './components/Button';
import { Modal } from './components/Modal';
import { CurrencyInput } from './components/CurrencyInput';
import { generateCollectionMessage, analyzeFinancialHealth } from './services/geminiService';

// Utility for IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Toast Types
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// Helper to format currency
const formatMoney = (amount: number, currency: string) => 
  new Intl.NumberFormat('es-CU', { style: 'currency', currency }).format(amount);

// DebtCard component
const DebtCard: React.FC<{ debt: Debt; onPay: () => void; onDelete: () => void }> = ({ debt, onPay, onDelete }) => {
  const isInventory = debt.type === 'INVENTORY';
  // Only show monetary value if it exists (greater than 0) or if it's strictly a monetary debt
  const showMonetary = !isInventory || debt.remainingAmountCUP > 0;

  return (
    <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isInventory ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
        
        <div className="flex justify-between items-start pl-3">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${isInventory ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isInventory ? 'Inventario' : 'Dinero'}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(debt.date).toLocaleDateString()}</span>
                </div>
                <h3 className="font-bold text-slate-800 text-lg">{debt.productNameSnapshot}</h3>
                {debt.description && <p className="text-slate-500 text-sm">{debt.description}</p>}
                
                {isInventory && (
                    <div className="mt-3">
                        <p className="text-xs text-slate-500 mb-1">Cajas Pendientes</p>
                        <div className="flex items-baseline gap-1 text-slate-800">
                            <Box size={20} className="text-orange-500" />
                            <span className="text-2xl font-bold">{debt.remainingQuantity?.toFixed(2)}</span>
                            <span className="text-sm text-slate-400 font-medium">/ {debt.initialQuantity}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="text-right flex flex-col justify-between h-full min-h-[80px]">
                {showMonetary ? (
                  <div>
                    <p className="text-xs text-slate-400">Restante Monetario</p>
                    <p className="text-xl font-bold text-slate-800">{formatMoney(debt.remainingAmountCUP, 'CUP')}</p>
                    <p className="text-xs text-slate-400 mt-1">
                        Orig: {formatMoney(debt.originalAmount, debt.originalCurrency)}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic mb-auto">
                    Precio a definir<br/>en el pago
                  </div>
                )}
                
                <div className="mt-auto pt-3 flex items-center justify-end gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                    title="Eliminar deuda"
                  >
                    <Trash2 size={16} />
                  </button>
                  <Button size="sm" onClick={onPay}>
                      <DollarSign size={14} className="mr-1" /> {isInventory ? 'Saldar' : 'Pagar'}
                  </Button>
                </div>
            </div>
        </div>
    </div>
  );
};

const App = () => {
  // --- State ---
  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const saved = localStorage.getItem('clients');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error loading clients", e);
      return [];
    }
  });
  
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('products');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error loading products", e);
      return [];
    }
  });

  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<'saved' | 'error'>('saved');
  
  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals State
  const [isClientModalOpen, setClientModalOpen] = useState(false);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [isDebtModalOpen, setDebtModalOpen] = useState(false);
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isAIModalOpen, setAIModalOpen] = useState(false);
  
  // Form State
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [productForm, setProductForm] = useState({ name: '' });
  
  // Debt Form
  const [debtForm, setDebtForm] = useState<{
    type: DebtType;
    productId: string;
    description: string;
    amount: number;
    currency: Currency;
    exchangeRate: number;
    quantity: number;
    pricePerBox: number;
  }>({
    type: 'MONETARY',
    productId: '',
    description: '',
    amount: 0,
    currency: Currency.CUP,
    exchangeRate: 1,
    quantity: 1,
    pricePerBox: 0
  });

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState<{
    debtId: string;
    amount: number;
    currency: Currency;
    exchangeRate: number;
    pricePerBox: number; // New field for inventory logic
  }>({
    debtId: '',
    amount: 0,
    currency: Currency.CUP,
    exchangeRate: 1,
    pricePerBox: 0
  });

  // AI State
  const [aiContent, setAiContent] = useState<{ text: string; loading: boolean; title: string }>({ 
    text: '', 
    loading: false, 
    title: '' 
  });

  // Filters
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'MONETARY' | 'INVENTORY'>('ALL');

  // --- Effects ---
  useEffect(() => {
    try {
      localStorage.setItem('clients', JSON.stringify(clients));
      localStorage.setItem('products', JSON.stringify(products));
      setStorageStatus('saved');
    } catch (e) {
      console.error("Storage failed", e);
      setStorageStatus('error');
      showToast("Error al guardar datos en local. Verifica tu espacio.", 'error');
    }
  }, [clients, products]);

  // --- Helpers ---
  const showToast = (message: string, type: ToastType = 'info') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getProduct = (id: string) => products.find(p => p.id === id);

  // --- Handlers ---

  // Backup & Restore
  const handleExportData = () => {
    const data = {
      version: 1,
      timestamp: new Date().toISOString(),
      clients,
      products
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-cobranzapro-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Copia de seguridad descargada', 'success');
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsedData = JSON.parse(content);

        if (!parsedData.clients || !Array.isArray(parsedData.clients) || !parsedData.products || !Array.isArray(parsedData.products)) {
          throw new Error('Formato de archivo inválido');
        }

        if (window.confirm('IMPORTANTE: Esta acción sobrescribirá todos los datos actuales con los del archivo de respaldo. ¿Estás seguro de continuar?')) {
          setClients(parsedData.clients);
          setProducts(parsedData.products);
          showToast('Base de datos restaurada con éxito', 'success');
          setView('DASHBOARD');
        }
      } catch (error) {
        console.error(error);
        showToast('Error al leer el archivo de respaldo', 'error');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = ''; // Reset input
        }
      }
    };
    reader.readAsText(file);
  };

  const handleFactoryReset = () => {
    const confirmation = window.confirm(
      "ADVERTENCIA: ¿Estás seguro de restablecer la aplicación a su estado original?\n\nEsto ELIMINARÁ PERMANENTEMENTE todos los clientes, productos y deudas.\nEsta acción no se puede deshacer."
    );

    if (confirmation) {
      setClients([]);
      setProducts([]);
      localStorage.removeItem('clients');
      localStorage.removeItem('products');
      setSelectedClientId(null);
      setView('DASHBOARD');
      showToast('Aplicación restablecida correctamente', 'success');
    }
  };

  const handleAddClient = () => {
    if (!clientForm.name.trim()) {
      showToast('El nombre es requerido', 'error');
      return;
    }
    const newClient: Client = {
      id: generateId(),
      ...clientForm,
      debts: []
    };
    setClients([...clients, newClient]);
    setClientForm({ name: '', phone: '', email: '', notes: '' });
    setClientModalOpen(false);
    showToast('Cliente agregado correctamente', 'success');
  };

  const handleAddProduct = () => {
    if (!productForm.name.trim()) {
      showToast('El nombre del producto es requerido', 'error');
      return;
    }
    const newProduct: Product = {
      id: generateId(),
      name: productForm.name
    };
    setProducts([...products, newProduct]);
    setProductForm({ name: '' });
    setProductModalOpen(false);
    showToast('Producto agregado', 'success');
  };

  const handleDeleteProduct = (id: string) => {
      if(window.confirm('¿Eliminar producto?')) {
          setProducts(products.filter(p => p.id !== id));
          showToast('Producto eliminado', 'info');
      }
  };

  const handleDeleteClient = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este cliente y todo su historial?')) {
      setClients(clients.filter(c => c.id !== id));
      if (selectedClientId === id) {
        setSelectedClientId(null);
        setView('CLIENT_LIST');
      }
      showToast('Cliente eliminado', 'info');
    }
  };

  const handleDeleteDebt = (clientId: string, debtId: string) => {
    if (window.confirm('¿Estás seguro de eliminar esta deuda permanentemente? Se perderá todo el historial de pagos asociado.')) {
      const updatedClients = clients.map(c => {
        if (c.id === clientId) {
          return {
            ...c,
            debts: c.debts.filter(d => d.id !== debtId)
          };
        }
        return c;
      });
      setClients(updatedClients);
      showToast('Deuda eliminada correctamente', 'info');
    }
  };

  const handleAddDebt = () => {
    if (!selectedClientId) return;

    let calculatedTotalOriginal = 0;

    if (debtForm.type === 'INVENTORY') {
        if (!debtForm.productId) {
            showToast('Selecciona un producto', 'error');
            return;
        }
        if (debtForm.quantity <= 0) {
             showToast('La cantidad de cajas debe ser mayor a 0', 'error');
             return;
        }
        // NOTE: For inventory, we no longer require pricePerBox at creation.
        // The value is 0 until payment is calculated.
        calculatedTotalOriginal = 0; 
    } else {
        if (debtForm.amount <= 0) {
            showToast('El monto debe ser mayor a 0', 'error');
            return;
        }
        calculatedTotalOriginal = debtForm.amount;
    }

    const client = getClient(selectedClientId);
    if (!client) return;

    // Calculate total CUP. For pure inventory debt, this will be 0.
    const totalCUP = calculatedTotalOriginal * debtForm.exchangeRate;
    
    // Inventory Merging Logic
    if (debtForm.type === 'INVENTORY') {
      const existingDebtIndex = client.debts.findIndex(
        d => d.type === 'INVENTORY' && 
             d.productId === debtForm.productId && 
             d.status !== 'PAID'
      );

      if (existingDebtIndex >= 0) {
        // Merge with existing debt
        const updatedClients = clients.map(c => {
          if (c.id === selectedClientId) {
            const updatedDebts = [...c.debts];
            const existingDebt = updatedDebts[existingDebtIndex];
            
            // Update quantity
            const newInitialQty = (existingDebt.initialQuantity || 0) + debtForm.quantity;
            const newRemainingQty = (existingDebt.remainingQuantity || 0) + debtForm.quantity;
            
            // Update monetary value (only if it had value before, otherwise stays 0/irrelevant)
            const newTotalCUP = existingDebt.totalAmountCUP + totalCUP;
            const newRemainingCUP = existingDebt.remainingAmountCUP + totalCUP;
            const newOriginalAmount = existingDebt.originalAmount + calculatedTotalOriginal;

            updatedDebts[existingDebtIndex] = {
              ...existingDebt,
              initialQuantity: newInitialQty,
              remainingQuantity: newRemainingQty,
              totalAmountCUP: newTotalCUP,
              remainingAmountCUP: newRemainingCUP,
              originalAmount: newOriginalAmount,
              date: new Date().toISOString()
            };
            return { ...c, debts: updatedDebts };
          }
          return c;
        });
        
        setClients(updatedClients);
        setDebtModalOpen(false);
        showToast(`Se agregaron ${debtForm.quantity} cajas a la deuda existente`, 'success');
        return;
      }
    }

    // Create New Debt
    const productName = debtForm.productId ? getProduct(debtForm.productId)?.name || 'Producto' : '';
    
    const newDebt: Debt = {
      id: generateId(),
      clientId: selectedClientId,
      type: debtForm.type,
      productId: debtForm.productId,
      productNameSnapshot: debtForm.type === 'INVENTORY' ? productName : (debtForm.description || 'Deuda Monetaria'),
      description: debtForm.description,
      originalAmount: calculatedTotalOriginal,
      originalCurrency: debtForm.currency,
      exchangeRate: debtForm.exchangeRate,
      totalAmountCUP: totalCUP,
      remainingAmountCUP: totalCUP,
      initialQuantity: debtForm.type === 'INVENTORY' ? debtForm.quantity : undefined,
      remainingQuantity: debtForm.type === 'INVENTORY' ? debtForm.quantity : undefined,
      status: 'PENDING',
      date: new Date().toISOString(),
      payments: []
    };

    const updatedClients = clients.map(c => 
      c.id === selectedClientId ? { ...c, debts: [...c.debts, newDebt] } : c
    );
    setClients(updatedClients);
    setDebtModalOpen(false);
    showToast('Deuda registrada correctamente', 'success');
  };

  const handleAddPayment = () => {
    if (!selectedClientId || !paymentForm.debtId) return;
    
    const client = getClient(selectedClientId);
    if (!client) return;
    
    const debt = client.debts.find(d => d.id === paymentForm.debtId);
    if (!debt) return;

    let quantityToReduce = 0;
    let cupToReduce = 0;
    
    if (debt.type === 'INVENTORY') {
        if (paymentForm.pricePerBox <= 0) {
            showToast('El precio por caja debe ser mayor a 0', 'error');
            return;
        }
        // Logic: User pays Amount. We divide Amount by PricePerBox to get Qty reduced.
        quantityToReduce = paymentForm.amount / paymentForm.pricePerBox;
        
        // Note: Amount paid is real money, so we track it. But we don't decrease debt.remainingAmountCUP 
        // if it was 0. We just track the payment history.
        cupToReduce = paymentForm.amount * paymentForm.exchangeRate; 

        if (quantityToReduce > (debt.remainingQuantity || 0) + 0.01) { 
            showToast('Estás pagando más cajas de las que se deben', 'error');
            return;
        }
    } else {
        cupToReduce = paymentForm.amount * paymentForm.exchangeRate;
        if (cupToReduce > debt.remainingAmountCUP + 1) { 
            showToast('El pago excede la deuda pendiente', 'error');
            return;
        }
    }

    const newPayment: Payment = {
      id: generateId(),
      debtId: debt.id,
      amountPaidOriginal: paymentForm.amount,
      currency: paymentForm.currency,
      exchangeRate: paymentForm.exchangeRate,
      amountPaidCUP: cupToReduce,
      quantityPaid: quantityToReduce || undefined,
      date: new Date().toISOString()
    };

    const updatedClients = clients.map(c => {
      if (c.id === selectedClientId) {
        return {
          ...c,
          debts: c.debts.map(d => {
            if (d.id === paymentForm.debtId) {
              const newRemainingCUP = Math.max(0, d.remainingAmountCUP - cupToReduce);
              const newRemainingQty = d.type === 'INVENTORY' && d.remainingQuantity !== undefined
                ? Math.max(0, d.remainingQuantity - quantityToReduce)
                : undefined;
              
              let newStatus: 'PENDING' | 'PARTIAL' | 'PAID' = 'PARTIAL';
              if (d.type === 'INVENTORY') {
                 newStatus = (newRemainingQty || 0) < 0.01 ? 'PAID' : 'PARTIAL';
              } else {
                 newStatus = newRemainingCUP < 1 ? 'PAID' : 'PARTIAL';
              }

              return {
                ...d,
                remainingAmountCUP: newRemainingCUP,
                remainingQuantity: newRemainingQty,
                status: newStatus,
                payments: [...d.payments, newPayment]
              };
            }
            return d;
          })
        };
      }
      return c;
    });

    setClients(updatedClients);
    setPaymentModalOpen(false);
    showToast('Pago registrado correctamente', 'success');
  };

  const generateAIMessage = async () => {
    if (!selectedClientId) return;
    const client = getClient(selectedClientId);
    if (!client) return;

    setAiContent({ text: '', loading: true, title: 'Generando mensaje de cobro...' });
    setAIModalOpen(true);
    const message = await generateCollectionMessage(client);
    setAiContent({ text: message, loading: false, title: 'Mensaje de Cobro Generado' });
  };

  const analyzeHealth = async () => {
    setAiContent({ text: '', loading: true, title: 'Analizando Salud Financiera...' });
    setAIModalOpen(true);
    const analysis = await analyzeFinancialHealth(clients);
    setAiContent({ text: analysis, loading: false, title: 'Análisis Financiero' });
  };

  // --- Render ---

  const renderDashboard = () => {
      const totalDebt = clients.reduce((acc, c) => acc + c.debts.reduce((dAcc, d) => dAcc + d.remainingAmountCUP, 0), 0);
      // Count total pending boxes (approx) just for fun or dashboard info?
      const totalPendingBoxes = clients.reduce((acc, c) => acc + c.debts.filter(d => d.type === 'INVENTORY').reduce((dAcc, d) => dAcc + (d.remainingQuantity || 0), 0), 0);

      const totalClients = clients.length;
      const activeClients = clients.filter(c => c.debts.some(d => d.status !== 'PAID')).length;

      return (
          <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl text-white shadow-lg">
                      <p className="text-blue-100 text-sm font-medium mb-1">Total Monetario por Cobrar</p>
                      <h2 className="text-3xl font-bold">{formatMoney(totalDebt, 'CUP')}</h2>
                      {totalPendingBoxes > 0 && (
                          <p className="text-sm mt-1 text-blue-200 font-medium">+ {totalPendingBoxes.toFixed(1)} Cajas pendientes</p>
                      )}
                      <div className="mt-4 flex items-center text-blue-100 text-sm">
                          <Wallet className="mr-2" size={16} /> Actualizado hoy
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                      <p className="text-slate-500 text-sm font-medium mb-1">Clientes Activos</p>
                      <h2 className="text-3xl font-bold text-slate-800">{activeClients} <span className="text-lg text-slate-400 font-normal">/ {totalClients}</span></h2>
                      <div className="mt-4 flex items-center text-slate-400 text-sm">
                          <Users className="mr-2" size={16} /> Cartera de clientes
                      </div>
                  </div>
                   <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl text-white shadow-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={analyzeHealth}>
                      <p className="text-emerald-100 text-sm font-medium mb-1">Asistente IA</p>
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                          <Sparkles size={24} /> Analizar
                      </h2>
                      <div className="mt-4 text-emerald-100 text-sm">
                          Obtener reporte de salud financiera
                      </div>
                  </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800">Actividad Reciente</h3>
                  </div>
                  <div className="p-6">
                      {clients.length === 0 ? (
                          <div className="text-center py-10 text-slate-400">
                              No hay actividad reciente
                          </div>
                      ) : (
                          <div className="space-y-4">
                            {clients.slice(0, 5).map(client => {
                                const pendingBoxes = client.debts.filter(d => d.type === 'INVENTORY').reduce((acc, d) => acc + (d.remainingQuantity || 0), 0);
                                return (
                                <div key={client.id} onClick={() => { setSelectedClientId(client.id); setView('CLIENT_DETAIL'); }} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold">
                                            {client.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-slate-800">{client.name}</h4>
                                            <p className="text-xs text-slate-500">{client.debts.filter(d => d.status !== 'PAID').length} deudas activas</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-bold text-slate-800 block">
                                            {formatMoney(client.debts.reduce((acc, d) => acc + d.remainingAmountCUP, 0), 'CUP')}
                                        </span>
                                        {pendingBoxes > 0 && (
                                            <span className="text-xs text-orange-500 font-medium flex items-center justify-end gap-1">
                                                <Box size={10} /> +{pendingBoxes.toFixed(1)} Cajas
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )})}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  const renderClientList = () => (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center">
             <div className="relative w-full max-w-xs">
                 <input type="text" placeholder="Buscar cliente..." className="pl-10 pr-4 py-2 w-full rounded-lg border border-slate-200 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all" />
                 <Users className="absolute left-3 top-2.5 text-slate-400" size={18} />
             </div>
             <Button onClick={() => setClientModalOpen(true)}>
                 <Plus size={18} className="mr-2" /> Nuevo Cliente
             </Button>
          </div>

          <div className="grid gap-3">
              {clients.map(client => {
                  const pendingBoxes = client.debts.filter(d => d.type === 'INVENTORY').reduce((acc, d) => acc + (d.remainingQuantity || 0), 0);
                  return (
                  <div key={client.id} onClick={() => { setSelectedClientId(client.id); setView('CLIENT_DETAIL'); }} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-center group">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-xl shadow-inner">
                              {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                              <h3 className="font-bold text-slate-800">{client.name}</h3>
                              <p className="text-sm text-slate-500">{client.phone || 'Sin teléfono'}</p>
                          </div>
                      </div>
                      <div className="text-right">
                           <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Deuda Total</p>
                           <p className="text-lg font-bold text-slate-900">
                               {formatMoney(client.debts.reduce((acc, d) => acc + d.remainingAmountCUP, 0), 'CUP')}
                           </p>
                           {pendingBoxes > 0 && (
                                <p className="text-xs text-orange-500 font-bold mt-1">
                                    + {pendingBoxes.toFixed(1)} Cajas
                                </p>
                           )}
                      </div>
                  </div>
              )})}
              {clients.length === 0 && (
                  <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                      <Users className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-500">No tienes clientes registrados aún.</p>
                      <Button variant="outline" className="mt-4" onClick={() => setClientModalOpen(true)}>Agregar el primero</Button>
                  </div>
              )}
          </div>
      </div>
  );

  const renderProductsView = () => (
      <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center">
              <div>
                  <h2 className="text-2xl font-bold text-slate-800">Mis Productos</h2>
                  <p className="text-slate-500 text-sm">Gestiona el catálogo de items disponibles</p>
              </div>
              <Button onClick={() => setProductModalOpen(true)}>
                  <Plus size={18} className="mr-2" /> Nuevo Producto
              </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => (
                  <div key={product.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center group hover:border-secondary/50 transition-colors">
                      <div className="flex items-center gap-3">
                          <div className="p-3 bg-orange-50 text-orange-500 rounded-lg">
                              <Package size={24} />
                          </div>
                          <span className="font-bold text-slate-800">{product.name}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }} className="text-slate-300 hover:text-red-500 transition-colors p-2" title="Eliminar producto">
                          <Trash2 size={18} />
                      </button>
                  </div>
              ))}
          </div>
          
          {products.length === 0 && (
              <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                  <Package className="mx-auto text-slate-300 mb-4" size={48} />
                  <h3 className="text-lg font-medium text-slate-900">Catálogo Vacío</h3>
                  <p className="text-slate-500 mb-6">Agrega productos para usar en deudas de inventario.</p>
                  <Button onClick={() => setProductModalOpen(true)}>Agregar Producto</Button>
              </div>
          )}
      </div>
  );

  const renderClientDetail = () => {
    const client = selectedClientId ? getClient(selectedClientId) : null;
    if (!client) return null;

    const activeDebts = client.debts.filter(d => d.status !== 'PAID');
    const paidDebts = client.debts.filter(d => d.status === 'PAID');
    const totalDebt = client.debts.reduce((acc, d) => acc + d.remainingAmountCUP, 0);
    const totalBoxes = client.debts.filter(d => d.type === 'INVENTORY').reduce((acc, d) => acc + (d.remainingQuantity || 0), 0);

    const debtsToShow = historyFilter === 'ALL' 
        ? [...activeDebts, ...paidDebts] 
        : [...activeDebts, ...paidDebts].filter(d => d.type === historyFilter);

    // Sort: Active first, then by date descending
    debtsToShow.sort((a, b) => {
        if (a.status === 'PAID' && b.status !== 'PAID') return 1;
        if (a.status !== 'PAID' && b.status === 'PAID') return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return (
      <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
            <button onClick={() => setView('CLIENT_LIST')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                <ArrowLeft size={24} />
            </button>
            <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-800">{client.name}</h2>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                    {client.phone && <span>{client.phone}</span>}
                    {client.email && <span>• {client.email}</span>}
                </div>
            </div>
            <div className="flex gap-2">
                 <Button variant="secondary" size="sm" onClick={generateAIMessage}>
                     <Sparkles size={16} className="mr-2" /> Generar Mensaje
                 </Button>
                 <Button variant="danger" size="sm" onClick={() => handleDeleteClient(client.id)}>
                     <Trash2 size={16} />
                 </Button>
            </div>
        </div>

        {/* Summary Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="relative z-10">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-slate-400 font-medium mb-1">Deuda Monetaria Total</p>
                        <h1 className="text-4xl font-bold tracking-tight">{formatMoney(totalDebt, 'CUP')}</h1>
                    </div>
                    {totalBoxes > 0 && (
                        <div className="text-right">
                             <p className="text-orange-400 font-medium mb-1">Inventario Pendiente</p>
                             <h2 className="text-3xl font-bold tracking-tight flex items-center justify-end gap-2">
                                 <Box size={24} /> {totalBoxes.toFixed(1)}
                             </h2>
                        </div>
                    )}
                </div>
                
                <div className="mt-6 flex gap-3">
                    <Button onClick={() => setDebtModalOpen(true)} className="bg-white text-slate-900 hover:bg-slate-100 border-none">
                        <Plus size={18} className="mr-2" /> Nueva Deuda
                    </Button>
                </div>
            </div>
        </div>

        {/* Filters & List */}
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-lg">Historial de Deudas</h3>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    {(['ALL', 'MONETARY', 'INVENTORY'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setHistoryFilter(f)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${historyFilter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {f === 'ALL' ? 'Todos' : f === 'MONETARY' ? 'Dinero' : 'Inventario'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                {debtsToShow.map(debt => (
                    <div key={debt.id} className={`${debt.status === 'PAID' ? 'opacity-60 grayscale' : ''} transition-all`}>
                        <DebtCard 
                            debt={debt} 
                            onPay={() => {
                                setPaymentForm({
                                    debtId: debt.id,
                                    amount: 0,
                                    currency: debt.originalCurrency,
                                    exchangeRate: debt.exchangeRate, // Default to original rate, user can change
                                    pricePerBox: 0
                                });
                                setPaymentModalOpen(true);
                            }} 
                            onDelete={() => client && handleDeleteDebt(client.id, debt.id)}
                        />
                    </div>
                ))}
                {debtsToShow.length === 0 && (
                    <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                        <p className="text-slate-400">No hay deudas registradas en esta categoría.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-20 md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col justify-between z-20">
        <div>
            <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b border-slate-100">
                <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30">
                    C
                </div>
                <span className="hidden md:block ml-3 font-bold text-slate-800 text-lg tracking-tight">CobranzaPro</span>
            </div>
            
            <nav className="p-4 space-y-2">
                <button onClick={() => setView('DASHBOARD')} className={`w-full flex items-center p-3 rounded-xl transition-all ${view === 'DASHBOARD' ? 'bg-secondary text-white shadow-md shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <LayoutDashboard size={20} />
                    <span className="hidden md:block ml-3 font-medium">Resumen</span>
                </button>
                <button onClick={() => setView('CLIENT_LIST')} className={`w-full flex items-center p-3 rounded-xl transition-all ${view === 'CLIENT_LIST' || view === 'CLIENT_DETAIL' ? 'bg-secondary text-white shadow-md shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Users size={20} />
                    <span className="hidden md:block ml-3 font-medium">Clientes</span>
                </button>
                <button onClick={() => setView('PRODUCTS')} className={`w-full flex items-center p-3 rounded-xl transition-all ${view === 'PRODUCTS' ? 'bg-secondary text-white shadow-md shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Package size={20} />
                    <span className="hidden md:block ml-3 font-medium">Productos</span>
                </button>
            </nav>
        </div>
        
        <div>
            {/* Data Management Controls */}
            <div className="p-4 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 hidden md:block">Datos</p>
                <button 
                    onClick={handleExportData}
                    className="w-full flex items-center p-2 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors text-sm"
                    title="Descargar Copia de Seguridad"
                >
                    <Download size={16} />
                    <span className="hidden md:block ml-3">Descargar Copia</span>
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center p-2 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors text-sm"
                    title="Restaurar Copia de Seguridad"
                >
                    <Upload size={16} />
                    <span className="hidden md:block ml-3">Restaurar</span>
                </button>
                <button 
                    onClick={handleFactoryReset}
                    className="w-full flex items-center p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors text-sm mt-2"
                    title="Restablecer Datos de Fábrica"
                >
                    <RefreshCw size={16} />
                    <span className="hidden md:block ml-3">Restablecer Fábrica</span>
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImportData} 
                    accept=".json" 
                    className="hidden" 
                />
            </div>

            <div className="p-4 border-t border-slate-100">
                <div className={`flex items-center justify-center md:justify-start p-2 rounded-lg text-xs font-medium ${storageStatus === 'saved' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                    {storageStatus === 'saved' ? <CheckCircle size={14} className="md:mr-2" /> : <AlertTriangle size={14} className="md:mr-2" />}
                    <span className="hidden md:inline">{storageStatus === 'saved' ? 'Guardado' : 'Error'}</span>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-5xl mx-auto p-6 md:p-10 pb-24">
            {view === 'DASHBOARD' && renderDashboard()}
            {view === 'CLIENT_LIST' && renderClientList()}
            {view === 'CLIENT_DETAIL' && renderClientDetail()}
            {view === 'PRODUCTS' && renderProductsView()}
        </div>
      </main>

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
          {toasts.map(toast => (
              <div key={toast.id} className={`pointer-events-auto flex items-center px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-in slide-in-from-bottom-5 fade-in duration-300 ${
                  toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-slate-800'
              }`}>
                  {toast.type === 'success' && <CheckCircle size={16} className="mr-2" />}
                  {toast.type === 'error' && <XCircle size={16} className="mr-2" />}
                  {toast.type === 'info' && <Info size={16} className="mr-2" />}
                  {toast.message}
              </div>
          ))}
      </div>

      {/* --- Modals --- */}

      {/* Client Modal */}
      <Modal isOpen={isClientModalOpen} onClose={() => setClientModalOpen(false)} title="Nuevo Cliente">
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                  <input autoFocus type="text" className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border" value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} placeholder="Ej. Juan Pérez" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                   <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                        <input type="tel" className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border" value={clientForm.phone} onChange={e => setClientForm({...clientForm, phone: e.target.value})} placeholder="+53 5..." />
                   </div>
                   <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email (Opcional)</label>
                        <input type="email" className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border" value={clientForm.email} onChange={e => setClientForm({...clientForm, email: e.target.value})} placeholder="juan@..." />
                   </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setClientModalOpen(false)}>Cancelar</Button>
                  <Button onClick={handleAddClient}>Guardar Cliente</Button>
              </div>
          </div>
      </Modal>

      {/* Product Modal */}
      <Modal isOpen={isProductModalOpen} onClose={() => setProductModalOpen(false)} title="Nuevo Producto">
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Producto</label>
                  <input autoFocus type="text" className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Ej. Caja de Pollo 15kg" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setProductModalOpen(false)}>Cancelar</Button>
                  <Button onClick={handleAddProduct}>Guardar Producto</Button>
              </div>
          </div>
      </Modal>

      {/* Debt Modal */}
      <Modal isOpen={isDebtModalOpen} onClose={() => setDebtModalOpen(false)} title="Registrar Nueva Deuda">
          <div className="space-y-5">
              {/* Type Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                  {(['MONETARY', 'INVENTORY'] as const).map(t => (
                      <button 
                        key={t}
                        onClick={() => setDebtForm(prev => ({...prev, type: t}))}
                        className={`py-2 text-sm font-medium rounded-md transition-all ${debtForm.type === t ? 'bg-white shadow-sm text-secondary' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          {t === 'MONETARY' ? 'Dinero' : 'Inventario'}
                      </button>
                  ))}
              </div>

              {debtForm.type === 'INVENTORY' ? (
                  <>
                      <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Producto</label>
                            <select 
                                className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border bg-white"
                                value={debtForm.productId}
                                onChange={e => setDebtForm({...debtForm, productId: e.target.value})}
                            >
                                <option value="">Seleccionar producto...</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                          </div>
                          <Button type="button" variant="secondary" className="mb-[1px] aspect-square p-0 w-[42px] flex items-center justify-center" onClick={() => setProductModalOpen(true)} title="Crear nuevo producto">
                              <Plus size={20} />
                          </Button>
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad de Cajas</label>
                          <input 
                            type="number" 
                            min="1" 
                            step="1"
                            className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border"
                            value={debtForm.quantity}
                            onChange={e => setDebtForm({...debtForm, quantity: parseFloat(e.target.value) || 0})}
                          />
                      </div>
                      
                      <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 flex items-start gap-2">
                          <Info size={16} className="mt-0.5 flex-shrink-0" />
                          <p>El precio de la caja se definirá al momento del pago (saldar deuda).</p>
                      </div>
                  </>
              ) : (
                  <>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                          <input 
                            type="text" 
                            className="w-full rounded-lg border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 p-2 border"
                            placeholder="Ej. Préstamo personal"
                            value={debtForm.description}
                            onChange={e => setDebtForm({...debtForm, description: e.target.value})}
                          />
                      </div>
                      <CurrencyInput 
                          label="Monto de la Deuda"
                          amount={debtForm.amount}
                          currency={debtForm.currency}
                          exchangeRate={debtForm.exchangeRate}
                          onAmountChange={(v) => setDebtForm(prev => ({...prev, amount: v}))}
                          onCurrencyChange={(v) => setDebtForm(prev => ({...prev, currency: v}))}
                          onRateChange={(v) => setDebtForm(prev => ({...prev, exchangeRate: v}))}
                      />
                  </>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <Button variant="ghost" onClick={() => setDebtModalOpen(false)}>Cancelar</Button>
                  <Button onClick={handleAddDebt}>Registrar Deuda</Button>
              </div>
          </div>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Registrar Pago">
          <div className="space-y-5">
              {selectedClientId && paymentForm.debtId && (
                  <div className="bg-blue-50 p-3 rounded border border-blue-100 mb-2 text-sm text-blue-800">
                      Pagando: <strong>{getClient(selectedClientId)?.debts.find(d => d.id === paymentForm.debtId)?.productNameSnapshot}</strong>
                  </div>
              )}

              {/* Inventory Payment Logic */}
              {selectedClientId && getClient(selectedClientId)?.debts.find(d => d.id === paymentForm.debtId)?.type === 'INVENTORY' && (
                  <div className="bg-orange-50 p-3 rounded border border-orange-100 text-sm text-orange-800 mb-2 space-y-3">
                      <div className="flex items-center gap-2 font-bold border-b border-orange-200 pb-2">
                           <Box size={16} />
                           <span>Saldar Inventario</span>
                      </div>
                      <p>Define el precio de la caja para calcular cuántas se amortizan con el pago.</p>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                            <label className="block text-xs font-bold uppercase text-orange-700 mb-1">Precio por Caja ({paymentForm.currency})</label>
                             <input 
                              type="number" 
                              className="w-full rounded border border-orange-300 bg-white p-2 text-sm focus:ring-2 focus:ring-orange-200 outline-none"
                              placeholder="Ej. 4500"
                              value={paymentForm.pricePerBox || ''}
                              onChange={(e) => setPaymentForm({...paymentForm, pricePerBox: parseFloat(e.target.value) || 0})}
                             />
                        </div>
                      </div>

                      {paymentForm.amount > 0 && paymentForm.pricePerBox > 0 && (
                        <div className="flex justify-between items-center bg-white/50 p-2 rounded">
                            <span>Equivale a:</span>
                            <span className="font-bold text-lg">{(paymentForm.amount / paymentForm.pricePerBox).toFixed(2)} Cajas</span>
                        </div>
                      )}
                  </div>
              )}

              <CurrencyInput 
                  label="Monto Pagado (Dinero)"
                  amount={paymentForm.amount}
                  currency={paymentForm.currency}
                  exchangeRate={paymentForm.exchangeRate}
                  onAmountChange={(v) => setPaymentForm(prev => ({...prev, amount: v}))}
                  onCurrencyChange={(v) => setPaymentForm(prev => ({...prev, currency: v}))}
                  onRateChange={(v) => setPaymentForm(prev => ({...prev, exchangeRate: v}))}
              />

              <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setPaymentModalOpen(false)}>Cancelar</Button>
                  <Button onClick={handleAddPayment}>Confirmar Pago</Button>
              </div>
          </div>
      </Modal>

      {/* AI Modal */}
      <Modal isOpen={isAIModalOpen} onClose={() => !aiContent.loading && setAIModalOpen(false)} title={aiContent.title}>
          <div className="space-y-4">
              {aiContent.loading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                      <Sparkles className="animate-pulse text-secondary mb-4" size={48} />
                      <p className="animate-pulse">Consultando a Gemini...</p>
                  </div>
              ) : (
                  <>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-700 whitespace-pre-wrap font-mono text-sm">
                        {aiContent.text}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(aiContent.text); showToast('Copiado', 'success'); }}>
                            <Copy size={16} className="mr-2" /> Copiar
                        </Button>
                        <Button onClick={() => setAIModalOpen(false)}>Cerrar</Button>
                    </div>
                  </>
              )}
          </div>
      </Modal>

    </div>
  );
};

export default App;
