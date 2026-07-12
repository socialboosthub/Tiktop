export default function handler(req,res){

res.setHeader(
"Set-Cookie",
"admin_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure"
);

res.json({
success:true
});

}
