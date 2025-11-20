import { GoogleGenAI } from "@google/genai";
import { Client, Currency } from "../types";

// Helper to format currency
const formatMoney = (amount: number, currency: string) => {
  return new Intl.NumberFormat('es-CU', { style: 'currency', currency }).format(amount);
};

export const generateCollectionMessage = async (client: Client): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("API Key not found in environment.");
    return "Error: Clave de API no configurada. No se puede generar el mensaje.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const totalDebt = client.debts.reduce((acc, debt) => acc + debt.remainingAmountCUP, 0);
    const debtDetails = client.debts
      .filter(d => d.status !== 'PAID')
      .map(d => `- ${d.productNameSnapshot}: Debe ${formatMoney(d.remainingAmountCUP, 'CUP')} (Original: ${formatMoney(d.originalAmount, d.originalCurrency)})`)
      .join('\n');

    const prompt = `
      Actúa como un asistente financiero cortés y profesional.
      Necesito redactar un mensaje de recordatorio de cobro para un cliente.
      
      Datos del cliente:
      Nombre: ${client.name}
      Deuda Total Pendiente: ${formatMoney(totalDebt, 'CUP')}
      
      Detalles de las deudas:
      ${debtDetails}
      
      Instrucciones:
      1. Escribe un mensaje corto y amable para enviar por WhatsApp.
      2. El tono debe ser profesional pero cercano.
      3. Incluye el desglose si es breve, o solo el total.
      4. No uses marcadores de posición, usa los datos reales proporcionados.
      5. NO inventes información.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "No se pudo generar el mensaje.";
  } catch (error) {
    console.error("Error generating message:", error);
    return "Ocurrió un error al conectar con el asistente de IA.";
  }
};

export const analyzeFinancialHealth = async (clients: Client[]): Promise<string> => {
    if (!process.env.API_KEY) return "API Key faltante.";

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const totalReceivable = clients.reduce((sum, client) => 
            sum + client.debts.reduce((dSum, debt) => dSum + debt.remainingAmountCUP, 0), 0
        );
        
        const clientCount = clients.length;
        const debtorCount = clients.filter(c => c.debts.some(d => d.remainingAmountCUP > 0)).length;

        const prompt = `
            Analiza brevemente el estado de las deudas de mi negocio.
            Total por cobrar (CUP): ${totalReceivable}
            Total Clientes: ${clientCount}
            Clientes con deuda activa: ${debtorCount}
            
            Dame 3 consejos breves o una conclusión rápida sobre la salud de mi cartera de cobros.
            Formato: Texto plano, máximo 3 frases.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text || "Análisis no disponible.";

    } catch (e) {
        return "Error en el análisis.";
    }
}
