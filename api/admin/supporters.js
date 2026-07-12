import jwt from "jsonwebtoken";
import clientPromise from "../../lib/mongodb.js";

export default async function handler(req,res){

const token=req.headers.authorization?.replace("Bearer ","");

try{

jwt.verify(token,process.env.ADMIN_SECRET);

}catch{

return res.status(401).json({
message:"Unauthorized"
});

}

const client=await clientPromise;

const db=client.db();

const supporters=await db.collection("donations")
.find({})
.sort({createdAt:-1})
.toArray();

res.json(supporters);

}
