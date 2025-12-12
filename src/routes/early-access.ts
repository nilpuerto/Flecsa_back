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

// Test endpoint
router.get('/test', (_req, res) => {
  res.json({ message: 'Early access route is working' });
});

router.post('/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Sanitize email
    const sanitizedEmail = escapeHtml(email);

    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    // Validate required environment variables
    if (!process.env.RESEND_FROM_EMAIL || !process.env.RESEND_TO_EMAIL) {
      throw new Error('RESEND_FROM_EMAIL and RESEND_TO_EMAIL must be configured');
    }

    const adminEmail = process.env.RESEND_TO_EMAIL; // nilpuerto19@gmail.com

    // Send confirmation email to the user
    const userEmailPromise = resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Welcome to Flecsa Early Access',
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
                Thank you for subscribing to <span class="highlight">Flecsa Early Access</span>.
              </p>
              
              <p class="message">
                We're working hard to make Flecsa 100% available and ready for you. We'll notify you as soon as the platform is fully open and ready to use.
              </p>
              
              <p class="message">
                Thanks for your interest and patience.
              </p>
              
              <div class="signature">
                <div class="signature-name">The Flecsa Team</div>
                <div class="signature-role">Never search for a file again</div>
              </div>
            </div>
            <div class="footer">
              <p class="footer-text">
                You're receiving this email because you signed up for early access at flecsa.com
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

    // Send notification email to admin
    const adminEmailPromise = resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: adminEmail,
      subject: 'New Early Access Subscription',
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
            .email-box {
              background-color: #f1f5f9;
              border-left: 4px solid #2563eb;
              padding: 20px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .email-label {
              font-size: 13px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 8px;
            }
            .email-value {
              font-size: 16px;
              color: #1e293b;
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
                A new user has subscribed to <span class="highlight">Flecsa Early Access</span>.
              </p>
              
              <div class="email-box">
                <div class="email-label">Subscriber Email</div>
                <div class="email-value">${sanitizedEmail}</div>
              </div>
              
              <p class="message">
                This is an automated notification from your Flecsa website.
              </p>
            </div>
            <div class="footer">
              <p class="footer-text">
                This is an automated notification email from flecsa.com
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    // Send both emails in parallel
    const [userEmailResult, adminEmailResult] = await Promise.all([
      userEmailPromise,
      adminEmailPromise
    ]);

    if (userEmailResult.error) {
      throw userEmailResult.error;
    }

    if (adminEmailResult.error) {
      console.error('⚠️ Failed to send admin notification, but user email was sent:', adminEmailResult.error);
    }

    console.log(`✅ Early access emails sent successfully via Resend. User email ID: ${userEmailResult.data?.id}, Admin email ID: ${adminEmailResult.data?.id}`);
    res.json({ success: true, message: 'Early access request sent successfully' });
  } catch (error: any) {
    console.error('❌ Error sending early access email:', error);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
    });
    
    const errorMessage = error.message || 'Failed to send early access request';
    res.status(500).json({ error: errorMessage, details: error.message });
  }
});

export default router;








