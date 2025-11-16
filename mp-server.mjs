// @ts-nocheck
// mp-server.mjs
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno (.env)
dotenv.config();

// Logs de debug para MP
console.log('MP_ACCESS_TOKEN cargado?', !!process.env.MP_ACCESS_TOKEN);
console.log(
  'MP_ACCESS_TOKEN (inicio):',
  process.env.MP_ACCESS_TOKEN?.slice(0, 10)
);

// 🔹 Cliente admin de Supabase (usa SERVICE_ROLE_KEY, solo backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔹 Configurar SDK de Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

const app = express();
app.use(cors());
app.use(express.json());

// 🟢 Crear preferencia + guardar orden en Supabase
app.post('/api/create-preference', async (req, res) => {
  try {
    const { items, payer, shippingData, shippingCost, total } = req.body;

    console.log('👉 Items recibidos:', items);
    console.log('👉 Payer recibido:', payer);
    console.log('👉 Shipping recibido:', shippingData);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No hay items en el carrito' });
    }

    // Normalizamos items para Mercado Pago
    const parsedItems = items.map((item) => {
      const price = Number(item.unit_price);
      const quantity = Number(item.quantity);

      if (Number.isNaN(price) || Number.isNaN(quantity)) {
        throw new Error(
          `Precio o cantidad inválida en item "${item.title}": unit_price=${item.unit_price}, quantity=${item.quantity}`
        );
      }

      return {
        title: item.title,
        unit_price: price,
        quantity,
        currency_id: 'ARS',
      };
    });

    const preference = new Preference(mpClient);

    // 🚀 ESTA es la forma correcta para tu SDK
    const preferenceResponse = await preference.create({
  body: {
    items: parsedItems,
    payer: {
      name: payer?.name,
      email: payer?.email,
    },
    back_urls: {
      success: 'http://localhost:5173/checkout-success',
      pending: 'http://localhost:5173/checkout-pending',
      failure: 'http://localhost:5173/checkout-failure',
    },
     auto_return: 'approved',
      },
    });

    console.log('✅ Preferencia creada OK:', preferenceResponse);

    const preferenceId = preferenceResponse.id;

    // Guardar pedido como "pending" en Supabase
    const { error: orderError } = await supabase.from('orders').insert({
      preference_id: preferenceId,
      status: 'pending',
      total_amount: total,
      shipping_cost: shippingCost,
      customer_name: shippingData?.name || payer?.name,
      customer_email: shippingData?.email || payer?.email,
      customer_phone: shippingData?.phone || null,
      address: shippingData?.address || null,
      city: shippingData?.city || null,
      province: shippingData?.province || null,
      items: parsedItems, // JSONB
    });

    if (orderError) {
      console.error('❌ Error guardando order en Supabase:', orderError);
    } else {
      console.log('📝 Pedido guardado en Supabase como pending');
    }

    // Respuesta al frontend
    return res.json({
      id: preferenceId,
      init_point: preferenceResponse.init_point,
    });
  } catch (error) {
    console.error('❌ Error creando preferencia:', error);
    return res.status(500).json({
      error: error.message || 'Error creando preferencia de pago',
    });
  }
});

// Levantar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mercado Pago backend escuchando en http://localhost:${PORT}`);
});
