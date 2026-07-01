require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

// Database Sync Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('Database connection failed:', err));

// Transaction Database Schema
const SupportSchema = new mongoose.Schema({
  email: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['one-time', 'monthly'], required: true },
  gateway: { type: String, enum: ['paypal', 'paystack'], required: true },
  status: { type: String, default: 'pending' }, // pending, completed, failed
  referenceId: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Support = mongoose.model('Support', SupportSchema);

// Transporter Config for Email Notifications
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // true for 465
  auth: {
    user: process.env.EMAIL_USER,
    季pass: process.env.EMAIL_PASS
  }
});

// Helper: Send Transaction Confirmation Email
async function sendThankYouEmail(userEmail, amount, type) {
  const subject = type === 'monthly' ? 'Welcome to TikTop Membership! 🚀' : 'Thank you for supporting TikTop! ❤️';
  const messageText = type === 'monthly'
    ? `Thank you for becoming an official TikTop member! Your monthly contribution of $${amount} keeps our operations running smoothly.`
    : `We have successfully received your one-time donation of $${amount}. Thank you for helping keep TikTop fast, free, and ad-light!`;

  try {
    await emailTransporter.sendMail({
      from: `"TikTop Support" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: subject,
      text: messageText,
      html: `<div style="font-family:sans-serif; padding:20px; max-width:600px; border:1px solid #ee1d52; border-radius:12px;">
              <h2 style="color:#ee1d52;">TikTop Platform Support</h2>
              <p>${messageText}</p>
              <br><hr style="border:none; border-top:1px solid #eee;">
              <p style="font-size:12px; color:#777;">This is an automated receipt for your transaction on TikTop.online.</p>
             </div>`
    });
    console.log(`Notification email dispatched to ${userEmail}`);
  } catch (err) {
    console.error('Email pipeline failed to send:', err.message);
  }
}

// Helper: Generate Live PayPal OAuth2 Access Token
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

// We need raw bodies for webhook verification parsing
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// ==========================================
// PAYPAL MODULE: DYNAMIC SUBSCRIPTION PLAN
// ==========================================
app.post('/api/create-paypal-subscription-plan', async (req, res) => {
  const { amount } = req.body;
  try {
    const token = await getPayPalAccessToken();
    // Dynamically create a runtime subscription plan unique to this user's custom choice
    const planPayload = {
      product_id: process.env.PAYPAL_PRODUCT_ID,
      name: `TikTop Monthly Membership - $${amount}`,
      description: `Custom tier recurring support for TikTop`,
      status: "ACTIVE",
      billing_cycles: [{
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0, // Infinite cycles until cancelled
        pricing_scheme: { fixed_price: { value: amount.toString(), currency_code: "USD" } }
      }],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3
      }
    };

    const response = await axios.post(`${process.env.PAYPAL_API_URL}/v1/billing/plans`, planPayload, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    res.json({ id: response.data.id });
  } catch (err) {
    console.error('PayPal Plan Generator Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to build PayPal subscription context plan.' });
  }
});

// ==========================================
// PAYSTACK MODULE: DYNAMIC PLAN CREATION
// ==========================================
app.post('/api/create-paystack-subscription-plan', async (req, res) => {
  const { amount } = req.body;
  try {
    // Paystack requires unique identification names or custom amounts converted to cents/kobo units
    const paystackAmountCents = amount * 100;
    
    const response = await axios.post('https://api.paystack.co/plan', {
      name: `TikTop Custom Membership $${amount}`,
      interval: 'monthly',
      amount: paystackAmountCents,
      currency: 'USD'
    }, {
      headers: { 'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }
    });

    res.json({ plan_code: response.data.data.plan_code });
  } catch (err) {
    console.error('Paystack Plan Generator Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to construct Paystack context plan runtime.' });
  }
});

// ==========================================
// ASYNCHRONOUS LIVE WEBHOOK LISTENERS
// ==========================================

// Paystack Live Verification Listener
app.post('/api/webhooks/paystack', async (req, res) => {
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid Webhook Origin Signature');
  }

  const event = req.body;
  // Listen for both one-time execution verification charges and structural subscription payments
  if (event.event === 'charge.success') {
    const data = event.data;
    const isSubscription = !!data.plan?.plan_code;

    // Persist log directly to MongoDB
    await Support.findOneAndUpdate(
      { referenceId: data.reference },
      {
        email: data.customer.email,
        amount: data.amount / 100,
        type: isSubscription ? 'monthly' : 'one-time',
        gateway: 'paystack',
        status: 'completed',
        referenceId: data.reference
      },
      { upsert: true, new: true }
    );

    await sendThankYouEmail(data.customer.email, data.amount / 100, isSubscription ? 'monthly' : 'one-time');
  }
  res.sendStatus(200);
});

// PayPal Live Verification Listener
app.post('/api/webhooks/paypal', async (req, res) => {
  // Parsing verification on body events
  const event = JSON.parse(req.body.toString());

  // 1. Check for one-time standard payments
  if (event.event_type === "PAYMENT.SALE.COMPLETED") {
    const sale = event.resource;
    const email = event.summary.includes('subscription') ? 'member@tiktop.online' : 'donor@tiktop.online'; // fallback mapping
    
    await Support.findOneAndUpdate(
      { referenceId: sale.id },
      { email: email, amount: parseFloat(sale.amount.total), type: 'one-time', gateway: 'paypal', status: 'completed', referenceId: sale.id },
      { upsert: true }
    );
  } 
  // 2. Check for dynamic automated subscription activations
  else if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") {
    const subscription = event.resource;
    const email = subscription.subscriber.email_address;
    
    await Support.findOneAndUpdate(
      { referenceId: subscription.id },
      {
        email: email,
        amount: parseFloat(subscription.billing_info.last_payment.amount.value),
        type: 'monthly',
        gateway: 'paypal',
        status: 'completed',
        referenceId: subscription.id
      },
      { upsert: true }
    );
    await sendThankYouEmail(email, subscription.billing_info.last_payment.amount.value, 'monthly');
  }

  res.sendStatus(200);
});

// Start Production Web Server Engine
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`TikTop Secure Live Payment Server initialized on port ${PORT}`));

