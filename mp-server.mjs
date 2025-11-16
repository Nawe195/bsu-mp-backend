// @ts-nocheck
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();

// 💥 CORS CONFIG CORRECTO
app.use(cors({
  origin: [
    FRONTEND_URL,
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// Para preflight OPTIONS
app.options('/api/create-preference', cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
});

app.post('/api/create-preference', async (req, res) => {
  try {
    const { items, payer, shippingData, shippingCost, total } = req.body;

    const parsedItems = items.map(item => ({
      title: item.title,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
      currency_id: "ARS",
    }));

    const preference = new Preference(mpClient);

    const preferenceResponse = await preference.create({
      body: {
        items: parsedItems,
        payer: {
          name: payer?.name,
          email: payer?.email
        },
        back_urls: {
          success: `${FRONTEND_URL}/checkout-success`,
          pending: `${FRONTEND_URL}/checkout-pending`,
          failure: `${FRONTEND_URL}/checkout-failure`,
        },
        auto_return: "approved",
      }
    });

    await supabase.from('orders').insert({
      preference_id: preferenceResponse.id,
      status: "pending",
      total_amount: total,
      shipping_cost: shippingCost,
      customer_name: shippingData?.name,
      customer_email: shippingData?.email,
      customer_phone: shippingData?.phone,
      address: shippingData?.address,
      city: shippingData?.city,
      province: shippingData?.province,
      items: parsedItems
    });

    res.json({
      id: preferenceResponse.id,
      init_point: preferenceResponse.init_point
    });

  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend MP corriendo en puerto", PORT);
});
