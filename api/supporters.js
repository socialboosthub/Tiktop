import clientPromise from "../lib/mongodb.js";

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db();

    const supporters = await db.collection("donations").aggregate([
      {
        $group: {
          _id: "$email",
          totalDonated: { $sum: "$amount" },
          donations: { $sum: 1 },
          lastMode: { $last: "$mode" },
          lastDonation: { $max: "$createdAt" }
        }
      },
      {
        $sort: {
          totalDonated: -1
        }
      }
    ]).toArray();

    res.json(supporters);

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
}
