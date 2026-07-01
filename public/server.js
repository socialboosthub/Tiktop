require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();

// Establish Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Hook Connection Established'))
  .catch(err => console.error('Database configuration missing or invalid:', err));

// Database transactional tracking log schema maps
const SupportSchema = new mongoose.Schema({
  email: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['one-time', 'monthly'], required: true },
  gateway: { type: String, default: 'paypal' },
  status: { type: String, default: 'completed' },
  referenceId: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Support = mongoose.model('Support', SupportSchema);

// Setup Outbound Mail System
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Mail Processing Delivery Controller
async function sendThankYouEmail(userEmail, amount, type) {
  const subject = type === 'monthly' ? 'Welcome to TikTop Membership Circle! 🚀' : 'Thank you for supporting TikTop! ❤️';
  const messageText = type === 'monthly'
    ? `Thank you for becoming an official active TikTop member! Your monthly subscription tier of $${amount} preserves ad-free, high-speed access tools globally.`
    : `We have successfully tracked your one-time platform support contribution of $${amount}. Thank you for helping keep our infrastructure scalable and completely free!`;

  try {
    await emailTransporter.sendMail({
      from: `"TikTop Support" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: subject,
      html: `<div style="font-family:sans-serif; padding:25px; max-width:600px; border:2px solid #ee1d52; border-radius:16px; background-color:#050515; color:#fff;">
              <h2 style="color:#25f4ee;">TikTop Platform Infrastructure</h2>
              <p style="font-size:15px; line-height:1.6; color:#e0e0e0;">${messageText}</p>
              <br><hr style="border:none; border-top:1px solid rgba(255,255,255,0.1);">
              <p style="font-size:11px; color:#888;">This is an automated system confirmation verification ledger for your transaction records on TikTop.online.</p>
             </div>`
    });
    console.log(`Dispatched receipt pipeline directly to customer: ${userEmail}`);
  } catch (err) {
    console.error('System mailer dispatch error:', err.message);
  }
}

// OAuth2 Client Token Handshake Loop
async function getPayPalAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const response = await axios({
    url: `${process.env.PAYPAL_API_URL}/v1/oauth2/token`,
    method: 'post',
    data: 'grant_type=client_credentials',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return response.data.access_token;
}

// Global Parser Pipeline Handlers
app.use('/api/webhooks/paypal', express.raw({ type: 'application/json' }));
app.use(express.json());

// CORS access headers (Ensures frontend cross-origin requests process smoothly)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// CREATE DYNAMIC TIER LEVEL PLANS
app.post('/api/create-paypal-subscription-plan', async (req, res) => {
  const { amount } = req.body;
  try {
    const token = await getPayPalAccessToken();
    
    const planPayload = {
      product_id: process.env.PAYPAL_PRODUCT_ID,
      name: `TikTop Custom Membership - Tier $${amount}`,
      description: `Bespoke configuration member recurring support for TikTop operations`,
      status: "ACTIVE",
      billing_cycles: [{
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: amount.toString(), currency_code: "USD" } }
      }],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 2
      }
    };

    const response = await axios.post(`${process.env.PAYPAL_API_URL}/v1/billing/plans`, planPayload, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    res.json({ id: response.data.id });
  } catch (err) {
    console.error('PayPal Runtime Plan Generation Failure:', err.response?.data || err.message);
    res.status(500).json({ error: 'Bespoke dynamic plan construction aborted on server runtime.' });
  }
});

// ASYNCHRONOUS LIVE WEBHOOK LISTENER
app.post('/api/webhooks/paypal', async (req, res) => {
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).send('Webhook body parsing exception.');
  }

  // 1. One-Time Donation Event Captured
  if (event.event_type === "PAYMENT.SALE.COMPLETED") {
    const sale = event.resource;
    // Extract the email passed in custom_id field via client layout
    const customFormEmail = sale.custom_id || (sale.billing_agreement_id ? null : 'donor@tiktop.online');

    if (customFormEmail && !sale.billing_agreement_id) { // Ensure it's purely a single purchase, not subscription cycle billing
      try {
        await Support.findOneAndUpdate(
          { referenceId: sale.id },
          {
            email: customFormEmail,
            amount: parseFloat(sale.amount.total),
            type: 'one-time',
            referenceId: sale.id,
            status: 'completed'
          },
          { upsert: true, new: true }
        );
        await sendThankYouEmail(customFormEmail, sale.amount.total, 'one-time');
      } catch (dbErr) {
        console.error('Database write exception parsing transaction:', dbErr.message);
      }
    }
  } 
  
  // 2. Automated Recurring Subscription Event Triggered
  else if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") {
    const subscription = event.resource;
    const customFormEmail = subscription.custom_id || subscription.subscriber.email_address;
    const totalValueAmount = subscription.billing_info?.last_payment?.amount?.value || "10.00";

    try {
      await Support.findOneAndUpdate(
        { referenceId: subscription.id },
        {
          email: customFormEmail,
          amount: parseFloat(totalValueAmount),
          type: 'monthly',
          referenceId: subscription.id,
          status: 'completed'
        },
        { upsert: true, new: true }
      );
      await sendThankYouEmail(customFormEmail, totalValueAmount, 'monthly');
    } catch (dbErr) {
      console.error('Database write exception tracking active membership:', dbErr.message);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`TikTop Dedicated PayPal Service running live on port ${PORT}`));

