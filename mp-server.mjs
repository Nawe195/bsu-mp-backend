// @ts-nocheck
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createClient } from "@supabase/supabase-js";

// 🔹 Cargar variables de entorno
dotenv.config();

// 🔹 URL del frontend (producción o localhost)
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// 🔹 Logs de debug para verificar envs en Railway
console.log("=== ENV DEBUG (MP Backend) ===");
console.log("FRONTEND_URL:", FRONTEND_URL);
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log(
  "SUPABASE_SERVICE_ROLE_KEY presente?",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY
);
console.log("MP_ACCESS_TOKEN presente?", !!process.env.MP_ACCESS_TOKEN);
console.log("================================");

// 🔹 Validaciones básicas (si falta algo, que rompa CLARO)
if (!process.env.SUPABASE_URL) {
  throw new Error("Falta SUPABASE_URL en las variables de entorno");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
}
if (!process.env.MP_ACCESS_TOKEN) {
  throw new Error("Falta MP_ACCESS_TOKEN en las variables de entorno");
}

// 🔹 Inicializar Express
const app = express();

// 🔹 CORS (frontend en Hostinger + localhost para pruebas)
app.use(
  cors({
    origin: [
      FRONTEND_URL,          // Producción (Hostinger)
      "http://localhost:5173" // Dev
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// 🔹 Manejar preflight OPTIONS explícitamente
app.options("/api/create-preference", cors());

// 🔹 Cliente admin de Supabase (solo backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔹 Configurar Mercado Pago SDK
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// 🔹 Endpoint para crear preferencia
app.post("/api/create-preference", async (req, res) => {
  try {
    const { items, payer, shippingData, shippingCost, total } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No hay items en el carrito" });
    }

    // Normalizar items para MP
    const parsedItems = items.map((item) => ({
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
          email: payer?.email,
        },
        back_urls: {
          success: `${FRONTEND_URL}/checkout-success`,
          pending: `${FRONTEND_URL}/checkout-pending`,
          failure: `${FRONTEND_URL}/checkout-failure`,
        },
        auto_return: "approved",
      },
    });

    // Guardar orden en Supabase
    await supabase.from("orders").insert({
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
      items: parsedItems, // JSONB
    });

    // Responder al frontend
    return res.json({
      id: preferenceResponse.id,
      init_point: preferenceResponse.init_point,
    });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    return res.status(500).json({ error: error.message || "Error interno" });
  }
});

// 🔹 Levantar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend MP corriendo en puerto", PORT);
});
