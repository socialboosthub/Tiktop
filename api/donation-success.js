import clientPromise from "../lib/mongodb.js";
import { verifyOrder } from "../lib/paypal.js";
import { sendThankYouEmail } from "../lib/email.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const {
      email,
      amount,
      mode,
      orderId
    } = req.body;

    if (!email || !orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields."
      });
    }

    // Verify payment with PayPal
    const order = await verifyOrder(orderId);

    if (order.status !== "COMPLETED" && order.status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Payment has not been completed."
      });
    }

    const client = await clientPromise;
    const db = client.db();

    // Prevent duplicate processing
    const existing = await db.collection("donations").findOne({
      orderId
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Donation already processed."
      });
    }

    // Save donation
    await db.collection("donations").insertOne({
      orderId,
      email,
      amount: Number(amount),
      mode,
      receiveUpdates,
      paypalStatus: order.status,
      payer:
        order.payer?.email_address || email,
      createdAt: new Date()
    });

    // Send thank-you email
    await sendThankYouEmail({
      email,
      amount,
      mode
    });

    return res.status(200).json({
      success: true
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
