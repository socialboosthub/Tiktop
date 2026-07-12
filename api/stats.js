import clientPromise from "../lib/mongodb.js";

export default async function handler(req, res) {

  try {

    const client = await clientPromise;
    const db = client.db();

    const donations = db.collection("donations");

    const totalDonations = await donations.countDocuments();

    const supporterEmails = await donations.distinct("email");

    const monthlyMembers = await donations.countDocuments({
      mode: "monthly"
    });

    const totalRaisedResult = await donations.aggregate([
      {
        $group: {
          _id: null,
          total: {
            $sum: "$amount"
          }
        }
      }
    ]).toArray();

    const totalRaised =
      totalRaisedResult.length > 0
        ? totalRaisedResult[0].total
        : 0;

    const recent = await donations
      .find()
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return res.status(200).json({

      totalDonations,

      totalRaised,

      monthlyMembers,

      supporters: supporterEmails.length,

      recent

    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      message: err.message
    });

  }

}
