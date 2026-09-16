export async function sendEmail({
  to,
  subject,
  html
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY eksik.');
  }

  if (!from) {
    throw new Error('EMAIL_FROM eksik.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Resend error:', data);
    throw new Error(
      data?.message || 'E-posta gönderilemedi.'
    );
  }

  return data;
}
