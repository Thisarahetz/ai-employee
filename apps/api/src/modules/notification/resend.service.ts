import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  apiKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  status: 'sent' | 'simulated' | 'failed';
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const apiKey = options.apiKey || process.env.RESEND_API_KEY;
    const fromAddress =
      options.from || process.env.RESEND_FROM || process.env.EMAIL_FROM || 'AI Employee <onboarding@resend.dev>';
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    if (!apiKey) {
      this.logger.log(
        `[Resend Simulation] No RESEND_API_KEY found. Simulated email to: ${recipients.join(', ')} | Subject: "${options.subject}"`,
      );
      return {
        success: true,
        id: `resend_sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'simulated',
      };
    }

    try {
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from: fromAddress,
          to: recipients,
          subject: options.subject,
          text: options.text,
          html: options.html || (options.text ? `<p>${options.text.replace(/\n/g, '<br/>')}</p>` : undefined),
          reply_to: options.replyTo,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );

      const emailId = response.data?.id || `resend_${Date.now()}`;
      this.logger.log(`Email dispatched via Resend: ${emailId} to ${recipients.join(', ')}`);
      return {
        success: true,
        id: emailId,
        status: 'sent',
      };
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message;
      this.logger.error(`Failed to send email via Resend: ${errMsg}`);
      return {
        success: false,
        error: errMsg,
        status: 'failed',
      };
    }
  }
}
