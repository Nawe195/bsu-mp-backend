// @ts-nocheck
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// 🔓 CORS súper abierto (por ahora)
app.use(cors());
app.use(express.json());

// 🔹 DEBUG de entorno
console.log('=== ENV DEBUG (MP Backend) ===');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log(
  'SUPABASE_SERVICE_ROLE_KEY presente?',
  !!process.env.SUPABASE_SERVICE_ROLE_KEY
);
console.log('MP_ACCESS_TOKEN presente?', !!process.env.MP_ACCESS_TOKEN);
console.log('================================');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

// Ruta simple para probar que el back responde
// justo después de app.use(express.json());

app.get('/', (req, res) => {
  res.send('MP backend OK');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});


app.get('/', (req, res) => {
  res.send('MP backend OK');
});

// 🔹 Crear preferencia
app.post('/api/create-preference', async (req, res) => {
  try {
    console.log('🌐 POST /api/create-preference');
    console.log('Origin:', req.headers.origin);
    console.log('Body recibido:', req.body);

    const { items, payer, shippingData, shippingCost, total } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No hay items en el carrito' });
    }

    const parsedItems = items.map((item) => ({
      title: item.title,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
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
          success: `${process.env.FRONTEND_URL}/checkout-success`,
          pending: `${process.env.FRONTEND_URL}/checkout-pending`,
          failure: `${process.env.FRONTEND_URL}/checkout-failure`,
        },
        auto_return: 'approved',
      },
    });

    console.log('✅ Preferencia creada:', preferenceResponse.id);

    await supabase.from('orders').insert({
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
      items: parsedItems,
    });

    return res.json({
      id: preferenceResponse.id,
      init_point: preferenceResponse.init_point,
    });
  } catch (error) {
    console.error('❌ Error creando preferencia:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Backend MP corriendo en puerto', PORT);
});
