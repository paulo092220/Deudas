import React, { useEffect, useState } from 'react';
import { Currency } from '../types';

interface CurrencyInputProps {
  label: string;
  amount: number;
  currency: Currency;
  exchangeRate: number;
  onAmountChange: (val: number) => void;
  onCurrencyChange: (val: Currency) => void;
  onRateChange: (val: number) => void;
  showResult?: boolean; // Show the calculation in CUP
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  label,
  amount,
  currency,
  exchangeRate,
  onAmountChange,
  onCurrencyChange,
  onRateChange,
  showResult = true
}) => {
  const [isCustomRate, setIsCustomRate] = useState(false);

  // Default rates map (could be moved to a context or constant)
  const defaultRates: Record<Currency, number> = {
    [Currency.CUP]: 1,
    [Currency.USD]: 320,
    [Currency.USDT]: 325,
    [Currency.ZELLE]: 315,
    [Currency.EUR]: 340,
  };

  // Update rate when currency changes, unless user manually edited it heavily or we want strict defaults
  useEffect(() => {
    if (!isCustomRate) {
       // If we haven't locked a custom rate interaction, imply the default
       onRateChange(defaultRates[currency]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  const calculatedCUP = amount * exchangeRate;

  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-1">
           <label className="text-xs text-slate-500 mb-1 block">Monto</label>
           <input
            type="number"
            min="0"
            step="0.01"
            value={amount || ''}
            onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
            className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
            placeholder="0.00"
          />
        </div>
        
        <div className="col-span-1">
          <label className="text-xs text-slate-500 mb-1 block">Moneda</label>
          <select
            value={currency}
            onChange={(e) => {
                setIsCustomRate(false);
                onCurrencyChange(e.target.value as Currency);
            }}
            className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border bg-white"
          >
            {Object.values(Currency).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rate Section - Only show if not CUP */}
      {currency !== Currency.CUP && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
           <div className="flex items-center justify-between mb-1">
             <label className="text-xs text-slate-500">Tasa de Cambio (1 {currency} = X CUP)</label>
             <span className="text-xs text-secondary cursor-pointer hover:underline" onClick={() => {
                 onRateChange(defaultRates[currency]);
                 setIsCustomRate(false);
             }}>Restaurar por defecto</span>
           </div>
           <input
            type="number"
            min="1"
            value={exchangeRate || ''}
            onChange={(e) => {
                setIsCustomRate(true);
                onRateChange(parseFloat(e.target.value) || 0);
            }}
            className="w-full rounded-md border-slate-300 shadow-sm focus:border-secondary focus:ring focus:ring-secondary/20 py-2 px-3 border"
          />
        </div>
      )}

      {/* Result Preview */}
      {showResult && (
          <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2">
              <span className="text-sm text-slate-500">Conversión a CUP:</span>
              <span className="text-lg font-bold text-slate-800">
                  {new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP' }).format(calculatedCUP)}
              </span>
          </div>
      )}
    </div>
  );
};