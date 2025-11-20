
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Users, ArrowLeft, DollarSign, AlertCircle, Sparkles, Wallet, Box, Trash2, History, LayoutDashboard, Settings, Download, Upload, RefreshCw, AlertTriangle } from 'lucide-react';
import { Client, Product, Debt, Currency, Payment, ViewState, DebtType } from './types';
import { Button } from './components/Button';
import { Modal } from './components/Modal';
import { CurrencyInput } from './components/CurrencyInput';
import { generateCollectionMessage, analyzeFinancialHealth } from './services/geminiService';

// Utility for IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

const App = () => {
  // --- State ---
  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('clients');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('products');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'HISTORY'>('GENERAL');

  // Modals State
  const [isAddClientModalOpen, setAddClientModalOpen] = useState(false);
  const [isAddDebtModalOpen, setAddDebtModalOpen] = useState(false);
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false); // Global Monetary Payment
  const [isInventoryPaymentModalOpen, setInventoryPaymentModalOpen] = useState(false); // Box Payment
  const [selectedDebtIdForPayment, setSelectedDebtIdForPayment] = useState<string | null>(null);

  const [aiAnalysis, setAiAnalysis] = useState<string>("");

  // --- Temporary Form States ---
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  
  // Debt Form State
  const [debtForm, setDebtForm] = useState({
    type: 'MONETARY' as DebtType,
    amount: 0, // For Money
    quantity: 0, // For Boxes
    currency: Currency.CUP,
    rate: 1,
    productId: '',
    newProductName: '',
    isNewProduct: false
  });

  // Payment Form State (Global Monetary)
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    currency: Currency.CUP,
    rate: 1
  });

  // Inventory Payment Form State
  const [invPaymentForm, setInvPaymentForm] = useState({
    amount: 0,
    currency: Currency.CUP,
    rate: 1,
    quantityToPay: 0
  });

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
      if (view === 'DASHBOARD') {
          analyzeFinancialHealth(clients).then(setAiAnalysis);
      }
  }, [clients, view]);

  useEffect(() => {
    // Reset tab when changing client
    setActiveTab('GENERAL');
  }, [selectedClientId]);

  // --- Derived State ---
  const selectedClient = useMemo(() => 
    clients.find(c => c.id === selectedClientId), 
  [clients, selectedClientId]);

  const totalReceivables = useMemo(() => 
    clients.reduce((acc, client) => acc + client.debts.reduce((dAcc, debt) => dAcc + debt.remainingAmountCUP, 0), 0),
  [clients]);

  const totalInventoryQty = useMemo(() => {
    if (!selectedClient) return 0;
    return selectedClient.debts
      .filter(d => d.type === 'INVENTORY' && d.status !== 'PAID')
      .reduce((acc, d) => acc + (d.remainingQuantity || 0), 0);
  }, [selectedClient]);

  // --- Actions ---

  const handleAddClient = () => {
    if (!newClientName.trim()) return;
    const newClient: Client = {
      id: generateId(),
      name: newClientName,
      phone: newClientPhone,
      debts: []
    };
    setClients([...clients, newClient]);
    setNewClientName('');
    setNewClientPhone('');
    setAddClientModalOpen(false);
  };

  const handleAddDebt = () => {
    if (!selectedClient) return;
    
    let finalProductId = debtForm.productId;
    let finalProductName = '';

    // Handle New Product Creation
    if (debtForm.isNewProduct && debtForm.newProductName.trim()) {
      const newProd: Product = {
        id: generateId(),
        name: debtForm.newProductName
      };
      setProducts([...products, newProd]);
      finalProductId = newProd.id;
      finalProductName = newProd.name;
    } else {
      const existing = products.find(p => p.id === debtForm.productId);
      if (!existing) return; 
      finalProductName = existing.name;
    }

    const updatedClients = clients.map(c => {
      if (c.id !== selectedClient.id) return c;

      // LÓGICA DE FUSIÓN PARA INVENTARIO
      if (debtForm.type === 'INVENTORY') {
        const existingDebtIndex = c.debts.findIndex(d => 
            d.type === 'INVENTORY' && 
            d.productId === finalProductId && 
            d.status !== 'PAID'
        );

        if (existingDebtIndex !== -1) {
            const updatedDebts = [...c.debts];
            const existingDebt = updatedDebts[existingDebtIndex];
            
            updatedDebts[existingDebtIndex] = {
                ...existingDebt,
                initialQuantity: (existingDebt.initialQuantity || 0) + debtForm.quantity,
                remainingQuantity: (existingDebt.remainingQuantity || 0) + debtForm.quantity,
                // Mantener el ID y otros datos para historial unificado en este modelo simplificado
            };
            
            return { ...c, debts: updatedDebts };
        }
      }

      const amountInCUP = debtForm.type === 'MONETARY' ? debtForm.amount * debtForm.rate : 0;
      
      const newDebt: Debt = {
        id: generateId(),
        clientId: selectedClient.id,
        productId: finalProductId,
        productNameSnapshot: finalProductName,
        type: debtForm.type,
        
        // Monetary specific
        originalAmount: debtForm.type === 'MONETARY' ? debtForm.amount : 0,
        originalCurrency: debtForm.type === 'MONETARY' ? debtForm.currency : Currency.CUP,
        exchangeRate: debtForm.type === 'MONETARY' ? debtForm.rate : 1,
        totalAmountCUP: amountInCUP,
        remainingAmountCUP: amountInCUP,

        // Inventory specific
        initialQuantity: debtForm.type === 'INVENTORY' ? debtForm.quantity : 0,
        remainingQuantity: debtForm.type === 'INVENTORY' ? debtForm.quantity : 0,

        status: 'PENDING',
        date: new Date().toISOString(),
        payments: []
      };

      return { ...c, debts: [newDebt, ...c.debts] };
    });

    setClients(updatedClients);
    setAddDebtModalOpen(false);
    setDebtForm({ ...debtForm, amount: 0, quantity: 0, productId: '', newProductName: '', isNewProduct: false });
  };

  const handleDeleteDebt = (debtId: string) => {
    if (!selectedClient) return;
    if (!window.confirm("¿Estás seguro de que quieres eliminar este registro de deuda? Esta acción no se puede deshacer.")) return;

    const updatedClients = clients.map(c => {
        if (c.id !== selectedClient.id) return c;
        return {
            ...c,
            debts: c.debts.filter(d => d.id !== debtId)
        };
    });
    setClients(updatedClients);
  };

  // Lógica de Pago Global (Cascada / FIFO) - SOLO para deudas monetarias
  const handlePayment = () => {
    if (!selectedClient) return;

    let moneyToDistributeCUP = paymentForm.amount * paymentForm.rate;
    const originalCurrencyRate = paymentForm.rate;
    
    const monetaryDebts = selectedClient.debts.filter(d => d.type === 'MONETARY');
    const otherDebts = selectedClient.debts.filter(d => d.type !== 'MONETARY');

    const sortedDebts = [...monetaryDebts].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const updatedMonetaryDebts = sortedDebts.map(debt => {
        if (moneyToDistributeCUP <= 0.01 || debt.status === 'PAID') {
            return debt;
        }

        const amountPending = debt.remainingAmountCUP;
        const amountToPay = Math.min(moneyToDistributeCUP, amountPending);
        
        moneyToDistributeCUP -= amountToPay;
        
        const amountPaidInPaymentCurrency = originalCurrencyRate > 0 
            ? amountToPay / originalCurrencyRate 
            : 0;

        const newRemaining = debt.remainingAmountCUP - amountToPay;

        const newPayment: Payment = {
            id: generateId(),
            debtId: debt.id,
            amountPaidOriginal: parseFloat(amountPaidInPaymentCurrency.toFixed(2)),
            currency: paymentForm.currency,
            exchangeRate: originalCurrencyRate,
            amountPaidCUP: amountToPay,
            date: new Date().toISOString(),
            note: 'Abono General'
        };

        return {
            ...debt,
            remainingAmountCUP: newRemaining,
            status: (newRemaining <= 0.5 ? 'PAID' : 'PARTIAL') as 'PAID' | 'PARTIAL',
            payments: [newPayment, ...debt.payments]
        };
    });
    
    const finalDebts = [...updatedMonetaryDebts, ...otherDebts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const updatedClients = clients.map(c => {
      if (c.id === selectedClient.id) {
        return { ...c, debts: finalDebts };
      }
      return c;
    });
    setClients(updatedClients);
    setPaymentModalOpen(false);
    setPaymentForm({ amount: 0, currency: Currency.CUP, rate: 1 });
  };

  const handleInventoryPayment = () => {
    if (!selectedClient || !selectedDebtIdForPayment) return;

    const updatedClients = clients.map(c => {
      if (c.id !== selectedClient.id) return c;

      const updatedDebts = c.debts.map(d => {
        if (d.id !== selectedDebtIdForPayment) return d;

        const qtyToPay = invPaymentForm.quantityToPay;
        if (qtyToPay > (d.remainingQuantity || 0)) return d;

        const newRemainingQty = (d.remainingQuantity || 0) - qtyToPay;
        const status: 'PAID' | 'PARTIAL' = newRemainingQty <= 0 ? 'PAID' : 'PARTIAL';
        
        const paymentInCUP = invPaymentForm.amount * invPaymentForm.rate;

        const newPayment: Payment = {
            id: generateId(),
            debtId: d.id,
            amountPaidOriginal: invPaymentForm.amount,
            currency: invPaymentForm.currency,
            exchangeRate: invPaymentForm.rate,
            amountPaidCUP: paymentInCUP,
            quantityPaid: qtyToPay,
            date: new Date().toISOString(),
            note: `Pago de ${qtyToPay} cajas`
        };

        return {
            ...d,
            remainingQuantity: newRemainingQty,
            status,
            payments: [...d.payments, newPayment]
        };
      });

      return { ...c, debts: updatedDebts };
    });

    setClients(updatedClients);
    setInventoryPaymentModalOpen(false);
    setInvPaymentForm({ amount: 0, currency: Currency.CUP, rate: 1, quantityToPay: 0 });
    setSelectedDebtIdForPayment(null);
  };

  const handleGenerateAI = async () => {
    if(!selectedClient) return;
    setIsGeneratingAI(true);
    const msg = await generateCollectionMessage(selectedClient);
    alert(msg); 
    setIsGeneratingAI(false);
  };

  // --- BACKUP & RESTORE LOGIC ---

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
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const content = e.target?.result as string;
              const parsed = JSON.parse(content);

              if (parsed.clients && Array.isArray(parsed.clients)) {
                  if (window.confirm(`Se han encontrado ${parsed.clients.length} clientes en el archivo. ¿Deseas reemplazar los datos actuales?`)) {
                      setClients(parsed.clients);
                      setProducts(parsed.products || []);
                      alert('Datos restaurados correctamente.');
                  }
              } else {
                  alert('El archivo no tiene el formato correcto.');
              }
          } catch (error) {
              console.error(error);
              alert('Error al leer el archivo de respaldo.');
          }
      };
      reader.readAsText(file);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetApp = () => {
      if (window.confirm("PELIGRO: ¿Estás seguro de que quieres borrar TODOS los datos de la aplicación? Esta acción no se puede deshacer.")) {
          if (window.confirm("Confirmación final: ¿Realmente deseas borrar todo?")) {
              setClients([]);
              setProducts([]);
              localStorage.clear();
              alert('La aplicación ha sido restablecida.');
          }
      }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      {/* Header General */}
      <header className="bg-primary text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('DASHBOARD')}>
             <div className="bg-secondary p-2 rounded-lg">
                <LayoutDashboard size={24} className="text-white" />
             </div>
             <h1 className="text-xl font-bold tracking-tight hidden md:block">CobranzaPro</h1>
          </div>
          <div className="flex items-center gap-4">
            {view !== 'DASHBOARD' && (
                <button onClick={() => setView('DASHBOARD')} className="text-slate-300 hover:text-white transition-colors flex items-center gap-2 text-sm">
                    <ArrowLeft size={18} /> <span className="hidden sm:inline">Volver</span>
                </button>
            )}
            <button 
                onClick={() => setView('SETTINGS')} 
                className={`p-2 rounded-full transition-colors ${view === 'SETTINGS' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 text-slate-400'}`}
                title="Configuración y Respaldo"
            >
                <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {view === 'DASHBOARD' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* AI Summary Card */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={120} /></div>
                <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Sparkles className="text-accent" size={20}/> Análisis de Cartera (AI)
                </h2>
                <p className="text-slate-300 leading-relaxed max-w-2xl">
                    {aiAnalysis || "Analizando datos financieros..."}
                </p>
                <div className="mt-6 flex gap-6">
                    <div>
                        <p className="text-slate-400 text-xs uppercase tracking-wider">Total por Cobrar</p>
                        <p className="text-3xl font-bold text-white">
                            {new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(totalReceivables)}
                        </p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs uppercase tracking-wider">Clientes Activos</p>
                        <p className="text-3xl font-bold text-white">{clients.length}</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800">Clientes</h2>
                <Button onClick={() => setAddClientModalOpen(true)}>
                    <Plus size={18} className="mr-2" /> Nuevo Cliente
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clients.map(client => {
                    const clientDebt = client.debts.reduce((acc, d) => acc + d.remainingAmountCUP, 0);
                    const hasInventoryDebt = client.debts.some(d => d.type === 'INVENTORY' && d.status !== 'PAID');
                    
                    return (
                        <div 
                          key={client.id} 
                          onClick={() => { setSelectedClientId(client.id); setView('CLIENT_DETAIL'); }}
                          className="bg-white p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-200 cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-slate-100 p-3 rounded-full group-hover:bg-blue-50 transition-colors">
                                    <Users size={24} className="text-slate-500 group-hover:text-secondary" />
                                </div>
                                {clientDebt > 0 && (
                                    <span className="px-2 py-1 bg-red-100 text-danger text-xs font-bold rounded-full">
                                        Deudor
                                    </span>
                                )}
                            </div>
                            <h3 className="font-semibold text-lg text-slate-900">{client.name}</h3>
                            <p className="text-slate-500 text-sm mb-4">{client.phone || 'Sin teléfono'}</p>
                            
                            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-sm text-slate-500">Deuda Total</span>
                                <span className={`font-bold ${clientDebt > 0 ? 'text-danger' : 'text-accent'}`}>
                                    {new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(clientDebt)}
                                </span>
                            </div>
                            {hasInventoryDebt && (
                                <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                                    <Box size={12} /> Tiene inventario pendiente
                                </div>
                            )}
                        </div>
                    );
                })}
                {clients.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <Users size={48} className="mx-auto mb-3 opacity-50" />
                        <p>No hay clientes registrados.</p>
                    </div>
                )}
            </div>
          </div>
        )}

        {view === 'SETTINGS' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Settings className="text-slate-400" /> Configuración y Datos
                    </h2>
                    <p className="text-slate-500">Gestiona las copias de seguridad y el estado de la aplicación.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Export Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
                        <div className="bg-blue-100 p-4 rounded-full mb-4 text-secondary">
                            <Download size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Crear Backup</h3>
                        <p className="text-sm text-slate-500 mb-6 flex-grow">
                            Descarga un archivo con todos tus clientes, deudas y productos para guardarlo en un lugar seguro.
                        </p>
                        <Button onClick={handleExportData} className="w-full">
                            Descargar Datos
                        </Button>
                    </div>

                    {/* Import Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
                        <div className="bg-emerald-100 p-4 rounded-full mb-4 text-emerald-600">
                            <Upload size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Restaurar Backup</h3>
                        <p className="text-sm text-slate-500 mb-6 flex-grow">
                            Sube un archivo previamente descargado para recuperar tus datos.
                            <br/>
                            <span className="text-xs font-bold text-amber-600">⚠️ Sobrescribirá los datos actuales.</span>
                        </p>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".json" 
                            onChange={handleImportData}
                        />
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                            Subir Archivo
                        </Button>
                    </div>

                    {/* Reset Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100 flex flex-col items-center text-center">
                        <div className="bg-red-100 p-4 rounded-full mb-4 text-danger">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Restablecer App</h3>
                        <p className="text-sm text-slate-500 mb-6 flex-grow">
                            Borra todos los datos de la aplicación y comienza desde cero.
                            <br/>
                            <span className="text-xs font-bold text-danger">⚠️ Irreversible.</span>
                        </p>
                        <Button variant="danger" onClick={handleResetApp} className="w-full">
                            Borrar Todo
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {view === 'CLIENT_DETAIL' && selectedClient && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
             {/* Client Header */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        {selectedClient.name}
                    </h2>
                    <p className="text-slate-500 flex items-center gap-2 mt-1">
                        {selectedClient.phone} <span className="text-slate-300">|</span> {selectedClient.debts.length} registros
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleGenerateAI} isLoading={isGeneratingAI}>
                        <Sparkles size={16} className="mr-2 text-secondary"/> Generar Recordatorio
                    </Button>
                    <Button onClick={() => setAddDebtModalOpen(true)}>
                        <Plus size={18} className="mr-2"/> Agregar Deuda
                    </Button>
                </div>
             </div>

             {/* Tabs */}
             <div className="flex space-x-1 bg-slate-200 p-1 rounded-lg w-fit">
                <button 
                  onClick={() => setActiveTab('GENERAL')} 
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'GENERAL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                    General
                </button>
                <button 
                  onClick={() => setActiveTab('HISTORY')} 
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'HISTORY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                    Historial
                </button>
             </div>

             {activeTab === 'GENERAL' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Monetary Summary */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><DollarSign size={100} /></div>
                        <h3 className="text-slate-500 font-medium mb-2 flex items-center gap-2">
                            <Wallet size={20} />
                            Deuda Monetaria Total
                        </h3>
                        <p className="text-4xl font-bold text-slate-800 mb-4">
                            {new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(
                                selectedClient.debts.filter(d => d.type === 'MONETARY').reduce((acc, d) => acc + d.remainingAmountCUP, 0)
                            )}
                        </p>
                        <Button onClick={() => setPaymentModalOpen(true)} className="w-full">
                            Registrar Abono (Dinero)
                        </Button>
                    </div>

                    {/* Inventory Summary */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Box size={100} /></div>
                        <h3 className="text-slate-500 font-medium mb-2 flex items-center gap-2">
                            <Box size={20} />
                            Inventario Pendiente
                        </h3>
                        
                        {/* MODIFIED: Show Total Boxes */}
                        <div className="mb-4">
                           <p className="text-4xl font-bold text-slate-800">
                             {totalInventoryQty} <span className="text-lg font-normal text-slate-500">Cajas</span>
                           </p>
                           <p className="text-sm text-slate-400">Total de productos por pagar</p>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto text-sm space-y-2">
                            {selectedClient.debts.filter(d => d.type === 'INVENTORY' && d.status !== 'PAID').map(d => (
                                <div key={d.id} className="flex justify-between items-center">
                                    <span className="font-medium">{d.productNameSnapshot}</span>
                                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                                        {d.remainingQuantity} u.
                                    </span>
                                </div>
                            ))}
                            {selectedClient.debts.filter(d => d.type === 'INVENTORY' && d.status !== 'PAID').length === 0 && (
                                <p className="text-slate-400 italic text-center">Todo al día</p>
                            )}
                        </div>
                    </div>
                 </div>
             )}

             {activeTab === 'HISTORY' && (
                 <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <History size={18} className="text-slate-500"/> Historial de Movimientos
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {[...selectedClient.debts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(debt => (
                            <div key={debt.id} className="p-6 hover:bg-slate-50 transition-colors">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${debt.type === 'INVENTORY' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-secondary'}`}>
                                            {debt.type === 'INVENTORY' ? <Box size={20}/> : <DollarSign size={20}/>}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{debt.productNameSnapshot}</h4>
                                            <p className="text-xs text-slate-500">
                                                {new Date(debt.date).toLocaleDateString()} • {debt.type === 'INVENTORY' ? 'Inventario' : 'Préstamo/Venta'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            debt.status === 'PAID' ? 'bg-green-100 text-green-700' : 
                                            debt.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' : 
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {debt.status === 'PAID' ? 'PAGADO' : debt.status === 'PARTIAL' ? 'PARCIAL' : 'PENDIENTE'}
                                        </div>
                                        <button 
                                          onClick={() => handleDeleteDebt(debt.id)}
                                          className="p-1 text-slate-400 hover:text-danger transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                                    <div>
                                        <p className="text-slate-400 text-xs">Monto/Cant. Original</p>
                                        <p className="font-medium">
                                            {debt.type === 'INVENTORY' 
                                              ? `${debt.initialQuantity} Cajas`
                                              : new Intl.NumberFormat('es-CU', { style: 'currency', currency: debt.originalCurrency }).format(debt.originalAmount)
                                            }
                                        </p>
                                    </div>
                                    {debt.type === 'MONETARY' && (
                                        <div>
                                            <p className="text-slate-400 text-xs">Tasa de Cambio</p>
                                            <p className="font-medium">{debt.exchangeRate}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-slate-400 text-xs">Deuda en CUP</p>
                                        <p className="font-medium text-slate-700">
                                            {new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(debt.totalAmountCUP)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400 text-xs">Restante</p>
                                        <p className="font-bold text-danger">
                                            {debt.type === 'INVENTORY'
                                              ? `${debt.remainingQuantity} Cajas`
                                              : new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(debt.remainingAmountCUP)
                                            }
                                        </p>
                                    </div>
                                </div>

                                {/* Payments List within Debt */}
                                {debt.payments.length > 0 && (
                                    <div className="mt-4 bg-slate-50 p-3 rounded-lg text-sm border border-slate-200">
                                        <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Historial de Pagos</p>
                                        <ul className="space-y-2">
                                            {debt.payments.map(pay => (
                                                <li key={pay.id} className="flex justify-between text-slate-600 border-b border-slate-200/50 last:border-0 pb-1 last:pb-0">
                                                    <span>
                                                        {new Date(pay.date).toLocaleDateString()} - {pay.note || 'Abono'}
                                                        {pay.quantityPaid ? ` (${pay.quantityPaid} cajas)` : ''}
                                                    </span>
                                                    <span className="font-mono text-secondary">
                                                        -{new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(pay.amountPaidCUP)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                
                                {/* Action Buttons for Specific Debt */}
                                {debt.status !== 'PAID' && debt.type === 'INVENTORY' && (
                                    <div className="mt-4 flex justify-end">
                                        <Button 
                                            size="sm" 
                                            variant="outline"
                                            onClick={() => {
                                                setSelectedDebtIdForPayment(debt.id);
                                                setInventoryPaymentModalOpen(true);
                                            }}
                                        >
                                            Pagar Cajas
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {selectedClient.debts.length === 0 && (
                            <div className="p-8 text-center text-slate-400">
                                Sin historial de deudas.
                            </div>
                        )}
                    </div>
                 </div>
             )}
          </div>
        )}
      </main>

      {/* --- MODALS --- */}

      {/* Add Client Modal */}
      <Modal isOpen={isAddClientModalOpen} onClose={() => setAddClientModalOpen(false)} title="Nuevo Cliente">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input 
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Ej. Juan Pérez"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
            <input 
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
              value={newClientPhone}
              onChange={(e) => setNewClientPhone(e.target.value)}
              placeholder="+53 5xxx xxxx"
            />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddClientModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddClient}>Guardar Cliente</Button>
          </div>
        </div>
      </Modal>

      {/* Add Debt Modal */}
      <Modal isOpen={isAddDebtModalOpen} onClose={() => setAddDebtModalOpen(false)} title="Nueva Deuda">
        <div className="space-y-4">
            {/* Type Selector */}
            <div className="flex p-1 bg-slate-100 rounded-lg">
                <button 
                    onClick={() => setDebtForm({...debtForm, type: 'MONETARY'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${debtForm.type === 'MONETARY' ? 'bg-white shadow text-secondary' : 'text-slate-500'}`}
                >
                    Dinero (Préstamo)
                </button>
                <button 
                    onClick={() => setDebtForm({...debtForm, type: 'INVENTORY'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${debtForm.type === 'INVENTORY' ? 'bg-white shadow text-secondary' : 'text-slate-500'}`}
                >
                    Inventario (Cajas)
                </button>
            </div>

            {/* Product Selection */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Producto / Concepto</label>
                {!debtForm.isNewProduct ? (
                    <div className="flex gap-2">
                        <select 
                            className="flex-1 rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border bg-white"
                            value={debtForm.productId}
                            onChange={(e) => setDebtForm({...debtForm, productId: e.target.value})}
                        >
                            <option value="">Seleccionar producto...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Button variant="outline" onClick={() => setDebtForm({...debtForm, isNewProduct: true, productId: ''})}>
                            <Plus size={16} />
                        </Button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <input 
                             className="flex-1 rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
                             placeholder="Nombre del nuevo producto"
                             value={debtForm.newProductName}
                             onChange={(e) => setDebtForm({...debtForm, newProductName: e.target.value})}
                        />
                         <Button variant="outline" onClick={() => setDebtForm({...debtForm, isNewProduct: false, newProductName: ''})}>
                            Cancelar
                        </Button>
                    </div>
                )}
            </div>

            {/* Specific Fields */}
            {debtForm.type === 'MONETARY' ? (
                <CurrencyInput 
                    label="Monto a Deber"
                    amount={debtForm.amount}
                    currency={debtForm.currency}
                    exchangeRate={debtForm.rate}
                    onAmountChange={(v) => setDebtForm({...debtForm, amount: v})}
                    onCurrencyChange={(v) => setDebtForm({...debtForm, currency: v})}
                    onRateChange={(v) => setDebtForm({...debtForm, rate: v})}
                />
            ) : (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad de Cajas</label>
                    <input 
                        type="number"
                        min="1"
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
                        value={debtForm.quantity || ''}
                        onChange={(e) => setDebtForm({...debtForm, quantity: parseInt(e.target.value) || 0})}
                    />
                </div>
            )}

            <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAddDebtModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleAddDebt}>Guardar Deuda</Button>
            </div>
        </div>
      </Modal>

      {/* Global Monetary Payment Modal */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Registrar Abono (Dinero)">
         <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-md text-blue-700 text-sm flex gap-2">
                <AlertCircle size={18} />
                <span>Este pago se distribuirá automáticamente entre las deudas monetarias más antiguas.</span>
            </div>
            <CurrencyInput 
                label="Monto del Pago"
                amount={paymentForm.amount}
                currency={paymentForm.currency}
                exchangeRate={paymentForm.rate}
                onAmountChange={(v) => setPaymentForm({...paymentForm, amount: v})}
                onCurrencyChange={(v) => setPaymentForm({...paymentForm, currency: v})}
                onRateChange={(v) => setPaymentForm({...paymentForm, rate: v})}
            />
            <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPaymentModalOpen(false)}>Cancelar</Button>
                <Button onClick={handlePayment}>Procesar Pago</Button>
            </div>
         </div>
      </Modal>

      {/* Inventory Payment Modal */}
      <Modal isOpen={isInventoryPaymentModalOpen} onClose={() => setInventoryPaymentModalOpen(false)} title="Pagar Cajas de Inventario">
         <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad de Cajas a Pagar</label>
                <input 
                    type="number"
                    min="1"
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
                    value={invPaymentForm.quantityToPay || ''}
                    onChange={(e) => setInvPaymentForm({...invPaymentForm, quantityToPay: parseInt(e.target.value) || 0})}
                />
            </div>

            <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Detalles del pago (Dinero entregado por las cajas)</p>
                <CurrencyInput 
                    label="Monto Pagado"
                    amount={invPaymentForm.amount}
                    currency={invPaymentForm.currency}
                    exchangeRate={invPaymentForm.rate}
                    onAmountChange={(v) => setInvPaymentForm({...invPaymentForm, amount: v})}
                    onCurrencyChange={(v) => setInvPaymentForm({...invPaymentForm, currency: v})}
                    onRateChange={(v) => setInvPaymentForm({...invPaymentForm, rate: v})}
                />
            </div>

            <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setInventoryPaymentModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleInventoryPayment}>Confirmar Pago</Button>
            </div>
         </div>
      </Modal>

    </div>
  );
};

export default App;
