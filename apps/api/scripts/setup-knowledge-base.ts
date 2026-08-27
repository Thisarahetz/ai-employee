import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { KnowledgeBaseService } from '../src/modules/knowledge-base/knowledge-base.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentSourceType } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const kbService = app.get(KnowledgeBaseService);

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found. Run the seed script first.');
    process.exit(1);
  }

  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);

  // Check if a knowledge base already exists
  let kb = await prisma.knowledgeBase.findFirst({ where: { tenantId: tenant.id } });
  if (!kb) {
    kb = await kbService.create(tenant.id, {
      name: 'Acme Salon Knowledge Base',
      description: 'Official services, pricing, business hours, and salon policies for Acme Salon.',
    });
    console.log(`Created Knowledge Base: ${kb.id}`);
  } else {
    console.log(`Found existing Knowledge Base: ${kb.id}`);
  }

  // Add Services & Pricing document
  const servicesContent = `
# Acme Salon - Services & Pricing Menu

## Haircut & Styling
- Women's Haircut & Blowdry: $65 (45 minutes) - Includes consultation, shampoo, cut, and signature blowout.
- Men's Haircut: $45 (30 minutes) - Includes precision cut, scalp massage, and style.
- Children's Cut (12 and under): $35 (30 minutes).
- Blowout & Styling: $45 (30 minutes).
- Special Occasion & Updo: $90 (60 minutes).

## Coloring & Highlights
- Single Process All-Over Color: $95 (60 minutes).
- Root Touch-Up: $75 (45 minutes).
- Partial Highlights / Balayage: $135 (90 minutes).
- Full Highlights / Full Balayage: $165 (120 minutes).
- Gloss & Toner Refresh: $50 (30 minutes).

## Hair Treatments
- Deep Conditioning Moisture Treatment: $40 (30 minutes).
- Olaplex Bond Repair Treatment: $55 (30 minutes).
- Brazilian Keratin Smoothing Treatment: $220 (150 minutes).
- Scalp Detox & Exfoliation: $45 (30 minutes).
  `.trim();

  await kbService.uploadDocument(tenant.id, kb.id, undefined, {
    title: 'Services & Pricing Menu',
    sourceType: DocumentSourceType.TEXT,
    content: servicesContent,
  });
  console.log('Added document: Services & Pricing Menu');

  // Add Hours, Location & Policies document
  const policiesContent = `
# Acme Salon - Hours, Location & Salon Policies

## Opening Hours
- Monday to Friday: 9:00 AM - 7:00 PM
- Saturday: 9:00 AM - 6:00 PM
- Sunday: 10:00 AM - 5:00 PM

## Location & Contact
- Address: 123 Fashion Boulevard, Suite 400, Downtown
- Phone: (555) 019-2834
- Parking: Complimentary 2-hour parking available in the attached parking garage.

## Booking & Cancellation Policy
- Appointments can be booked online via our website chat or by phone.
- Cancellations and rescheduling must be requested at least 24 hours in advance.
- Late cancellations (under 24 hours) may incur a 50% service fee.
- Walk-in clients are welcome based on stylist availability, though booking ahead is highly recommended.
  `.trim();

  await kbService.uploadDocument(tenant.id, kb.id, undefined, {
    title: 'Hours, Location & Policies',
    sourceType: DocumentSourceType.TEXT,
    content: policiesContent,
  });
  console.log('Added document: Hours, Location & Policies');

  // Add FAQ document
  const faqContent = `
# Acme Salon - Frequently Asked Questions (FAQ)

Q: Do I need an appointment or can I walk in?
A: We welcome walk-ins, but we strongly recommend booking in advance to ensure your preferred stylist and time slot are available.

Q: What hair color brands do you use?
A: We use premium, cruelty-free, and ammonia-free salon professional color lines like Redken, Wella, and Olaplex.

Q: How long does a Balayage service take?
A: A full Balayage session typically takes between 2 to 2.5 hours depending on hair length and thickness.

Q: Do you offer consultations before big color changes?
A: Yes! We offer complimentary 15-minute consultations to discuss your hair goals, realistic outcomes, and pricing estimates.
  `.trim();

  await kbService.uploadDocument(tenant.id, kb.id, undefined, {
    title: 'Frequently Asked Questions',
    sourceType: DocumentSourceType.FAQ,
    content: faqContent,
  });
  console.log('Added document: Frequently Asked Questions');

  console.log('Knowledge base setup complete! Embeddings are being generated.');

  // Wait a few seconds for ingestion
  await new Promise((r) => setTimeout(r, 6000));
  await app.close();
}

bootstrap().catch(console.error);
