import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendThankYouEmail({ email, amount, mode }) {

  const receipt = "TT-" + Date.now();

  return await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: email,

    subject:
      mode === "monthly"
        ? "Welcome to TikTop Membership ❤️"
        : "Thank you for supporting TikTop ❤️",

    html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>

<body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 15px;">

<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:18px;overflow:hidden;">

<tr>
<td align="center"
style="padding:40px;background:linear-gradient(90deg,#EE1D52,#25F4EE);">

<img
src="https://tiktop.online/assets/Logo.png"
width="90"
style="display:block;margin-bottom:15px;">

<h1 style="margin:0;color:white;font-size:34px;">
TikTop
</h1>

<p style="margin-top:10px;color:white;font-size:15px;">
Fast • Secure • No Watermark
</p>

</td>
</tr>

<tr>

<td style="padding:40px;">

<h2 style="margin-top:0;color:#111;font-size:28px;">
Thank you for supporting TikTop ❤️
</h2>

<p style="font-size:16px;color:#555;line-height:1.8;">

Your contribution has been received successfully.

Thank you for helping us keep TikTop fast, reliable and available for millions of users around the world.

</p>

<table width="100%" cellpadding="12" cellspacing="0"
style="background:#f7f7f7;border-radius:10px;margin:30px 0;">

<tr>
<td><strong>Receipt</strong></td>
<td align="right">${receipt}</td>
</tr>

<tr>
<td><strong>Amount</strong></td>
<td align="right">$${amount}</td>
</tr>

<tr>
<td><strong>Type</strong></td>
<td align="right">
${mode === "monthly" ? "Monthly Membership" : "One-Time Donation"}
</td>
</tr>

<tr>
<td><strong>Status</strong></td>
<td align="right" style="color:#16a34a;">
Completed ✓
</td>
</tr>

</table>

<p style="font-size:16px;color:#555;line-height:1.8;">

Every contribution helps us:

</p>

<ul style="color:#555;line-height:1.9;padding-left:20px;">
<li>⚡ Improve download speed</li>
<li>🚀 Build new download tools</li>
<li>🌎 Keep TikTop online worldwide</li>
<li>❤️ Reduce intrusive advertising</li>
</ul>

<div style="text-align:center;margin:40px 0;">

<a href="https://tiktop.online"
style="
background:#EE1D52;
color:white;
padding:16px 36px;
border-radius:8px;
text-decoration:none;
font-weight:bold;
display:inline-block;
font-size:16px;
">

Visit TikTop

</a>

</div>

${
mode === "monthly"
?
`
<p style="font-size:14px;color:#666;line-height:1.7;">
Your monthly membership will automatically renew through PayPal unless you cancel it.
You can manage or cancel your subscription at any time from your PayPal Automatic Payments settings.
</p>
`
:
""
}

<hr style="border:none;border-top:1px solid #eee;margin:35px 0;">

<p style="font-size:14px;color:#888;line-height:1.8;text-align:center;">

Need help?<br>

<strong>support@tiktop.online</strong>

<br><br>

<a href="https://tiktop.online" style="color:#EE1D52;text-decoration:none;">
https://tiktop.online
</a>

</p>

</td>

</tr>

<tr>

<td
style="
background:#111;
color:#bbb;
padding:25px;
text-align:center;
font-size:13px;
">

© ${new Date().getFullYear()} TikTop. All rights reserved.

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>
</html>
`
  });

}
