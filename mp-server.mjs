// @ts-nocheck
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

/* =======================
   VARIABLES DE ENTORNO
   ======================= */
const {
  PORT = 8080,
  FRONTEND_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  MP_ACCESS_TOKEN,
  NODE_ENV = 'development',
} = process.env;

// Log básico para debug
console.log('=== MP BACKEND ENV ===');
console.log('NODE_ENV:', NODE_ENV);
console.log('FRONTEND_URL:', FRONTEND_URL);
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY presente?', !!SUPABASE_SERVICE_ROLE_KEY);
console.log('MP_ACCESS_TOKEN presente?', !!MP_ACCESS_TOKEN);
console.log('=======================');

// Validaciones mínimas
if (!FRONTEND_URL) {
  console.warn('⚠️  FRONTEND_URL no está definido en las env vars.');
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  Faltan datos de Supabase en las env vars.');
}
if (!MP_ACCESS_TOKEN) {
  console.warn('⚠️  Falta MP_ACCESS_TOKEN en las env vars.');
}

/* =======================
   INICIALIZACIÓN
   ======================= */
const app = express();

app.use(
  cors({
    origin: true, // permite cualquier origen (podés restringir después)
    credentials: true,
  }),
);
app.use(express.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN || '',
});

/* =======================
   RUTAS BÁSICAS
   ======================= */

app.get('/', (_req, res) => {
  res.send('MP backend OK');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/* =======================
   CREAR PREFERENCIA MP
   ======================= */

app.post('/api/create-preference', async (req, res) => {
  try {
    console.log('🌐 POST /api/create-preference');
    console.log('Origin:', req.headers.origin);
    console.log('Body recibido:', req.body);

    const { items, payer, shippingData, shippingCost, total } = req.body;

    // Validación básica de items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No hay items en el carrito' });
    }

    // Normalizamos items al formato que espera MP
    const parsedItems = items.map((item) => ({
      title: String(item.title),
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity) || 1,
      currency_id: 'ARS',
    }));

    const preference = new Preference(mpClient);

    const preferenceResponse = await preference.create({
      body: {
        items: parsedItems,
        payer: {
          name: payer?.name,
          email: payer?.email,
        },
        back_urls: {
          // IMPORTANTE: usamos #/ porque el front está con HashRouter
          success: `${FRONTEND_URL}/#/checkout-success`,
          pending: `${FRONTEND_URL}/#/checkout-pending`,
          failure: `${FRONTEND_URL}/#/checkout-failure`,
        },
        auto_return: 'approved',
      },
    });

    console.log('✅ Preferencia creada:', preferenceResponse.id);

    // Guardamos la orden en Supabase
    const { error: dbError } = await supabase.from('orders').insert({
      preference_id: preferenceResponse.id,
      status: 'pending',
      total_amount: total,
      shipping_cost: shippingCost,
      customer_name: shippingData?.name,
      customer_email: shippingData?.email,
      customer_phone: shippingData?.phone,
      address: shippingData?.address,
      city: shippingData?.city,
      province: shippingData?.province,
      items: parsedItems, // asumiendo columna JSONB
    });

    if (dbError) {
      console.error('❌ Error insertando en Supabase:', dbError);
      // Podés decidir si querés cortar acá o igual devolver la preferencia
    }

    // Devolvemos los datos necesarios al front
    return res.json({
      id: preferenceResponse.id,
      init_point: preferenceResponse.init_point,
    });
  } catch (error) {
    console.error('❌ Error creando preferencia:', error);
    return res.status(500).json({
      error: 'Error interno al crear la preferencia de pago',
    });
  }
});

/* =======================
   ARRANCAR SERVIDOR
   ======================= */
app.listen(PORT, () => {
  console.log(`🚀 Backend MP corriendo en puerto ${PORT} (${NODE_ENV})`);
});
