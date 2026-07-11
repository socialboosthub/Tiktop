import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendThankYouEmail({
  email,
  amount,
  mode
}) {
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
</head>

<body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:12px;overflow:hidden;">

<tr>
<td align="center"
style="padding:35px;background:linear-gradient(90deg,#EE1D52,#25F4EE);">

<h1 style="margin:0;color:white;">
TikTop
</h1>

</td>
</tr>

<tr>
<td style="padding:40px;">

<h2 style="margin-top:0;color:#111;">
Thank You ❤️
</h2>

<p style="font-size:16px;color:#444;line-height:1.7;">

Thank you for your

<strong>$${amount}</strong>

${mode === "monthly"
  ? "monthly membership."
  : "donation."}

</p>

<p style="font-size:16px;color:#444;line-height:1.7;">

Your contribution helps us keep TikTop fast, secure and available for everyone.

</p>

<p style="font-size:16px;color:#444;line-height:1.7;">

We truly appreciate your support.

</p>

<div style="margin-top:35px;text-align:center;">

<a href="https://tiktop.online"

style="
background:#EE1D52;
color:white;
padding:15px 30px;
text-decoration:none;
border-radius:8px;
display:inline-block;
font-weight:bold;
">

Visit TikTop

</a>

</div>

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

© TikTop

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
