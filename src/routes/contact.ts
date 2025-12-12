import { Router } from 'express';
import { Resend } from 'resend';

const router = Router();

// Initialize Resend client (will throw if API key is missing)
const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  throw new Error('RESEND_API_KEY environment variable is required');
}
const resend = new Resend(resendApiKey);

// Sanitize HTML to prevent XSS
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

router.post('/support', async (req, res) => {
    const { email, message } = req.body;

    if (!email || !message || !email.includes('@')) {
        return res.status(400).json({ message: 'Email and message are required and email must be valid' });
    }

    // Sanitize inputs to prevent XSS
    const sanitizedEmail = escapeHtml(email);
    const sanitizedMessage = escapeHtml(message).replace(/\n/g, '<br>');

    try {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not configured');
        }

        // Validate required environment variables
        if (!process.env.RESEND_FROM_EMAIL || !process.env.RESEND_TO_EMAIL) {
            throw new Error('RESEND_FROM_EMAIL and RESEND_TO_EMAIL must be configured');
        }

        // Send confirmation email to the user only (like Early Access)
        const userEmail = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: email, // Send confirmation to the user
            subject: 'Your message to Flecsa',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                      line-height: 1.7;
                      color: #1e293b;
                      background-color: #f8fafc;
                      margin: 0;
                      padding: 40px 20px;
                    }
                    .container {
                      max-width: 600px;
                      margin: 0 auto;
                      background-color: #ffffff;
                    }
                    .header {
                      border-bottom: 2px solid #e2e8f0;
                      padding: 40px 50px 30px;
                    }
                    .brand {
                      font-size: 28px;
                      font-weight: 700;
                      color: #1e293b;
                      letter-spacing: -0.5px;
                      margin: 0;
                    }
                    .content {
                      padding: 50px;
                    }
                    .greeting {
                      font-size: 16px;
                      color: #334155;
                      margin-bottom: 30px;
                      line-height: 1.8;
                    }
                    .message {
                      font-size: 16px;
                      line-height: 1.8;
                      color: #475569;
                      margin-bottom: 25px;
                    }
                    .highlight {
                      color: #2563eb;
                      font-weight: 600;
                    }
                    .footer {
                      background-color: #f8fafc;
                      padding: 30px 50px;
                      border-top: 1px solid #e2e8f0;
                    }
                    .footer-text {
                      font-size: 13px;
                      color: #64748b;
                      line-height: 1.6;
                      margin: 0;
                    }
                    .signature {
                      margin-top: 40px;
                      padding-top: 30px;
                      border-top: 1px solid #e2e8f0;
                    }
                    .signature-name {
                      font-weight: 600;
                      color: #1e293b;
                      margin-bottom: 5px;
                    }
                    .signature-role {
                      font-size: 14px;
                      color: #64748b;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1 class="brand">Flecsa</h1>
                    </div>
                    <div class="content">
                      <p class="greeting">Hello,</p>
                      
                      <p class="message">
                        Thank you for contacting <span class="highlight">Flecsa</span>.
                      </p>
                      
                      <p class="message">
                        We've received your message and will get back to you as soon as possible.
                      </p>
                      
                      <div class="signature">
                        <div class="signature-name">The Flecsa Team</div>
                        <div class="signature-role">Never search for a file again</div>
                      </div>
                    </div>
                    <div class="footer">
                      <p class="footer-text">
                        You're receiving this email because you sent a message through our contact form at flecsa.com
                      </p>
                      <p class="footer-text" style="margin-top: 15px;">
                        This is an automated email, please do not reply.
                      </p>
                    </div>
                  </div>
                </body>
                </html>
            `,
        });

        if (userEmail.error) {
            throw userEmail.error;
        }

        console.log(`✅ Contact form confirmation sent successfully via Resend. ID: ${userEmail.data?.id}`);
        res.status(200).json({ success: true, message: 'Message sent successfully' });
    } catch (error: any) {
        console.error('❌ Error sending contact form email:', error);
        console.error('Error details:', {
            message: error.message,
            name: error.name,
        });
        
        const errorMessage = error.message || 'Failed to send message';
        res.status(500).json({ success: false, message: errorMessage, details: error.message });
    }
});

export default router;
