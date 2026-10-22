export interface BusinessTemplateDoc {
  title: string;
  category: "PRICING" | "HOURS_LOCATION" | "FAQ" | "POLICIES";
  content: string;
}

export interface IndustryStarterPack {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultName: string;
  documents: (biz: { name: string; phone: string; address: string; currency: string }) => BusinessTemplateDoc[];
}

export interface IndividualDocTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  generateContent: (biz: { name: string; phone: string; address: string; currency: string }) => string;
}

const RAW_STARTER_PACKS: IndustryStarterPack[] = [
  {
    id: "PHONE_SHOP",
    name: "Phone & Mobile Shop",
    category: "Retail & Electronics",
    description: "Smartphones, repairs, device warranty, trade-ins & accessory pricing",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Products & Device Pricing`,
        category: "PRICING",
        content: `# ${biz.name} - Device Catalog & Repair Pricing

## Flagship Smartphones
- iPhone 15 Pro Max (256GB): ${biz.currency} 1,199 (Includes 1-year official warranty & tempered glass)
- iPhone 15 (128GB): ${biz.currency} 799 (Brand new sealed box, full Apple warranty)
- Samsung Galaxy S24 Ultra (512GB): ${biz.currency} 1,299 (Includes S-Pen, 1-year Samsung warranty)
- Google Pixel 8 Pro (128GB): ${biz.currency} 899 (Unlocked, all carriers supported)
- Certified Refurbished iPhone 13 (128GB): ${biz.currency} 449 (90-day store warranty, 90%+ battery health)

## Express Repair & Service Rates
- iPhone Screen Replacement (OLED OEM): ${biz.currency} 89 - ${biz.currency} 189 (Same-day 45 min service)
- Smartphone Battery Replacement: ${biz.currency} 49 - ${biz.currency} 79 (30 min installation, 6-month warranty)
- Charging Port Repair / Cleaning: ${biz.currency} 35 - ${biz.currency} 60
- Back Glass Laser Repair: ${biz.currency} 65 - ${biz.currency} 110
- Liquid Damage Diagnostic & Ultrasonic Cleaning: ${biz.currency} 45

## Popular Accessories
- Anker 30W Fast Charger & Braided Cable: ${biz.currency} 25
- Premium MagSafe Leather & Clear Cases: ${biz.currency} 29 - ${biz.currency} 39
- 9H Tempered Glass Screen Protector (Installed free): ${biz.currency} 15
- Wireless Noise-Cancelling Earbuds: ${biz.currency} 79 - ${biz.currency} 149
`,
      },
      {
        title: `${biz.name} - Hours, Location & Trade-in Policy`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Store Hours, Location & Services

## Store Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- WhatsApp Hotline: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Parking: Free customer parking available in front of the store.

## Operating Hours
- Monday to Friday: 9:30 AM - 7:30 PM
- Saturday: 10:00 AM - 6:00 PM
- Sunday: 11:00 AM - 4:00 PM
- Public Holidays: Open 11:00 AM - 4:00 PM (Repair technician on call)

## Trade-in & Upgrade Program
- We accept used smartphones (Apple, Samsung, Google) in working condition.
- Trade-in valuation takes approximately 10 minutes in-store.
- Value can be applied directly towards any new device purchase or repair bill.
`,
      },
      {
        title: `${biz.name} - Customer FAQ & Warranty`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions & Warranty

## Frequently Asked Questions (FAQ)

Q: How long does a screen repair take?
A: Most screen replacements are completed within 45 to 60 minutes. You can wait in our lounge or drop off your device.

Q: Do you offer a warranty on repairs?
A: Yes! All hardware repairs include our 90-day comprehensive parts and labor warranty. If the part malfunctions, we replace it free of charge.

Q: Are your replacement parts original?
A: We use OEM-spec (Original Equipment Manufacturer) Grade-A+ components that match the original color gamut, touch sensitivity, and battery longevity.

Q: Do I need to back up my data before bringing my phone in?
A: While we never wipe your device during screen or battery replacements, we strongly recommend backing up your data for privacy and safety.

Q: What payment methods do you accept?
A: We accept Visa, Mastercard, American Express, Apple Pay, Google Pay, and Cash. We also offer 0% interest installment plans for new phones.

## Return & Exchange Policy
- Unopened accessories and devices may be returned within 14 days with original receipt.
- Defective devices are replaced immediately within 7 days of purchase.
`,
      },
    ],
  },
  {
    id: "SALON_SPA",
    name: "Salon & Spa",
    category: "Beauty & Wellness",
    description: "Hair styling, color, treatments, nail care, appointment rules & spa packages",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Services & Pricing Menu`,
        category: "PRICING",
        content: `# ${biz.name} - Services & Pricing Menu

## Haircut & Styling
- Women's Haircut & Signature Blowout: ${biz.currency} 65 (45 mins) - Consultation, shampoo, cut & blowout
- Men's Precision Cut & Scalp Massage: ${biz.currency} 40 (30 mins) - Cut, wash, neck trim & styling
- Children's Cut (Under 12): ${biz.currency} 30 (30 mins)
- Blowout & Thermal Styling: ${biz.currency} 45 (35 mins)
- Special Event & Bridal Updo: ${biz.currency} 95 (60 mins)

## Color & Highlights
- Full Highlights / Balayage: ${biz.currency} 165 (120 mins)
- Partial Highlights: ${biz.currency} 125 (90 mins)
- Single-Process Root Touch-up: ${biz.currency} 75 (60 mins)
- Gloss, Glaze & Toner Refresh: ${biz.currency} 50 (30 mins)
- Creative Vivid / Fashion Coloring: ${biz.currency} 190+ (Consultation required)

## Hair Care & Treatments
- Olaplex No. 1 & 2 Intensive Bond Repair: ${biz.currency} 55 (30 mins)
- Brazilian Keratin Smoothing Treatment: ${biz.currency} 220 (150 mins - lasts 3 to 5 months)
- Scalp Detox & Deep Conditioning Mask: ${biz.currency} 45 (30 mins)

## Nail Care & Spa
- Signature Gel Manicure: ${biz.currency} 45 (45 mins)
- Luxury Spa Pedicure with Hot Towels: ${biz.currency} 65 (60 mins)
- Express Mani-Pedi Combo: ${biz.currency} 85 (75 mins)
`,
      },
      {
        title: `${biz.name} - Hours, Location & Booking Rules`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Salon Hours, Location & Booking

## Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Online Booking: Available 24/7 via website chat or phone.
- Parking: Complimentary customer parking in rear lot (spots marked "STUDIO").

## Studio Hours
- Tuesday to Friday: 9:00 AM - 7:00 PM
- Saturday: 8:30 AM - 6:00 PM
- Sunday: 10:00 AM - 4:00 PM
- Monday: Closed for professional training & sanitization

## Booking & Cancellation Policy
- Appointments are highly recommended, though walk-ins are welcomed subject to stylist availability.
- We request at least 24 hours notice for any cancellations or reschedulings.
- Late cancellations (less than 24 hours) may incur a 50% deposit fee on the subsequent booking.
- Please arrive 5 minutes before your scheduled appointment time.
`,
      },
      {
        title: `${biz.name} - Frequently Asked Questions (FAQ)`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions (FAQ)

Q: How do I book an appointment?
A: You can book instantly by messaging our AI assistant right here, calling us at ${biz.phone || "[ADD YOUR PHONE NUMBER]"}, or dropping by during business hours.

Q: What hair color and treatment products do you use?
A: We exclusively use professional, ammonia-free, and cruelty-free formulas including Redken, Wella Professionals, and Olaplex.

Q: Can I request a specific stylist or colorist?
A: Absolutely! Let our assistant know your preferred stylist when booking, and we will schedule you for their next available opening.

Q: Do you offer consultations before big color changes?
A: Yes, we provide free 15-minute consultations to review your hair goals, examine current hair health, and give an accurate price quote.

Q: What payments are accepted?
A: We accept all major Credit/Debit cards, Apple Pay, Google Pay, and Cash. Gratuities can be added directly via card or cash.
`,
      },
    ],
  },
  {
    id: "RESTAURANT_CAFE",
    name: "Restaurant & Café",
    category: "Food & Hospitality",
    description: "Dine-in menu, takeout specials, table reservations, dietary options & catering",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Dining Menu & Specials`,
        category: "PRICING",
        content: `# ${biz.name} - Menu & Pricing

## Starters & Appetizers
- Artisanal Truffle & Parmesan Fries: ${biz.currency} 12 (Crispy hand-cut fries with garlic aioli)
- Wood-Fired Burrata & Cherry Tomatoes: ${biz.currency} 16 (Balsamic glaze, fresh basil, sourdough)
- Crispy Calamari: ${biz.currency} 15 (Chili lime dipping sauce)
- Soup of the Day: ${biz.currency} 9 (Served with warm focaccia)

## Handcrafted Mains
- Classic Wagyu Cheeseburger: ${biz.currency} 21 (Brioche bun, aged cheddar, caramelized onion, fries)
- Wild Mushroom & Truffle Pappardelle: ${biz.currency} 23 (Fresh handmade pasta, parmesan cream)
- Pan-Seared Atlantic Salmon: ${biz.currency} 28 (Garlic herb butter, asparagus, mashed potatoes)
- Wood-Fired Margherita Pizza: ${biz.currency} 18 (San Marzano tomatoes, fresh mozzarella, basil)
- Grilled Ribeye Steak (10oz): ${biz.currency} 36 (Rosemary chimichurri, roasted seasonal vegetables)

## Artisan Coffee & Beverages
- Espresso / Americano: ${biz.currency} 4.00
- Cappuccino / Flat White / Latte: ${biz.currency} 5.25 (Oat & almond milk available: +${biz.currency} 0.75)
- Fresh Cold-Pressed Juices (Orange, Green Detox): ${biz.currency} 7.00
- House Lemonade & Iced Teas: ${biz.currency} 4.50
`,
      },
      {
        title: `${biz.name} - Hours, Reservations & Policies`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Operating Hours, Location & Policies

## Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Reservations: Available online or by phone.
- Delivery: Available through UberEats, DoorDash, and direct online pickup.

## Operating Hours
- Monday to Thursday: 11:30 AM - 10:00 PM
- Friday: 11:30 AM - 11:00 PM
- Saturday: 10:00 AM - 11:00 PM (Brunch served until 3:00 PM)
- Sunday: 10:00 AM - 9:00 PM (Brunch served until 3:00 PM)

## Table Reservation Policies
- Reservations can be held for up to 15 minutes past scheduled arrival time.
- Parties of 6 or more require a credit card hold; cancellations within 3 hours incur a ${biz.currency} 20 per person fee.
- Patio seating is available weather-permitting and dog-friendly.
`,
      },
      {
        title: `${biz.name} - Dietary Information & FAQs`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions & Dietary Guide

Q: Do you offer vegetarian, vegan, or gluten-free options?
A: Yes! Over 40% of our menu can be prepared gluten-free or 100% plant-based. Gluten-free pasta and pizza crusts are available upon request.

Q: Do you accept walk-ins?
A: Walk-ins are always welcome. During peak weekend dinner hours (6:30 PM - 8:30 PM), reservations are recommended to avoid wait times.

Q: Can you host private parties or corporate events?
A: Yes, our private mezzanine dining room accommodates up to 35 guests. Custom prix-fixe menus are available for large gatherings.

Q: Do you offer catering for office lunches or parties?
A: Yes, we provide boxed lunches, party platters, and full buffet setups with 24-hour advance notice.

Q: Are children welcomed?
A: Absolutely! We have highchairs and a dedicated Little Diners menu ($9 per meal with juice and dessert).
`,
      },
    ],
  },
  {
    id: "CLINIC_MEDICAL",
    name: "Clinic & Medical Center",
    category: "Healthcare",
    description: "Doctor consultations, wellness checks, clinic timings, appointment triage & fees",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Consultation Services & Fees`,
        category: "PRICING",
        content: `# ${biz.name} - Medical Services & Fee Schedule

## General Consultations
- Routine General Practitioner (GP) Visit: ${biz.currency} 75 (15-20 mins)
- Comprehensive Health Checkup: ${biz.currency} 160 (45 mins - vitals, blood screening review, ECG)
- Pediatric Child Consultation: ${biz.currency} 70 (20 mins)
- Telehealth Virtual Video Consultation: ${biz.currency} 55 (15 mins)

## Preventive Care & Screening
- Annual Influenza Vaccination: ${biz.currency} 30
- Basic Blood Panel (Cholesterol, Glucose, Liver, Kidney): ${biz.currency} 65
- Routine ECG / Heart Tracing: ${biz.currency} 50
- Blood Pressure & Diabetes Management Check: ${biz.currency} 45

## Minor Procedures
- Wound Dressing & Suture Removal: ${biz.currency} 40 - ${biz.currency} 80
- Ear Wax Syringing / Irrigation: ${biz.currency} 55
- Minor Skin Lesion / Wart Cryotherapy: ${biz.currency} 95
`,
      },
      {
        title: `${biz.name} - Hours, Location & Patient Guidelines`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Clinic Hours, Location & Guidelines

## Clinic Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Emergency Contact: For life-threatening emergencies, please dial 911 immediately.
- Wheelchair Accessibility: Fully accessible with elevator and reserved patient parking.

## Clinic Hours
- Monday to Friday: 8:00 AM - 6:00 PM
- Saturday: 8:30 AM - 1:00 PM
- Sunday & Public Holidays: Closed (On-call physician available for registered patients)

## Patient Guidelines & Insurance
- Please bring a valid government photo ID and your current health insurance card.
- Direct insurance billing is available for major providers (BlueCross, Aetna, Cigna, UnitedHealthcare).
- Prescription refills can be requested via our secure patient messaging or by phone.
`,
      },
      {
        title: `${biz.name} - Patient FAQ & Appointment Policy`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions & Appointment Policy

Q: How do I schedule a doctor appointment?
A: You can book an appointment through our AI reception assistant, call our reception directly, or walk in during morning hours.

Q: Do you accept walk-in patients?
A: Yes, walk-ins are seen on a first-come, first-served basis, with priority given to urgent pediatric and acute cases.

Q: How do I get my lab test results?
A: Routine blood and urine test results are typically available within 24 to 48 hours. Our clinic nurse will notify you securely.

Q: What should I do if I need to cancel or reschedule?
A: Please provide at least 12 hours notice so we can offer the slot to another patient in need.

Q: Can the doctor provide medical certificates for work or school?
A: Yes, official medical certificates and fit-to-work letters are issued following an in-person or telehealth consultation.
`,
      },
    ],
  },
  {
    id: "GROCERY_SUPERMARKET",
    name: "Grocery & Supermarket",
    category: "Retail",
    description: "Produce, pantry staples, home delivery zones, return policy & loyalty savings",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Product Categories & Pricing`,
        category: "PRICING",
        content: `# ${biz.name} - Fresh Market Categories & Pricing

## Farm-Fresh Produce
- Organic Bananas: ${biz.currency} 0.79 / lb
- Crisp Honeycrisp Apples: ${biz.currency} 2.49 / lb
- Fresh Hass Avocados (Pack of 4): ${biz.currency} 4.99
- Organic Baby Spinach (16oz container): ${biz.currency} 4.49
- Vine-Ripened Tomatoes: ${biz.currency} 1.99 / lb

## Dairy & Bakery
- Farm Fresh Whole Milk (1 Gallon): ${biz.currency} 3.89
- Pasture-Raised Organic Eggs (Dozen): ${biz.currency} 4.99
- Fresh Sourdough Bread (Artisan Loaf): ${biz.currency} 4.25
- Greek Yogurt (32oz tub): ${biz.currency} 4.19

## Pantry Staples & Meat
- Extra Virgin Olive Oil (1 Liter): ${biz.currency} 11.99
- Jasmine Rice (5 lb bag): ${biz.currency} 6.49
- Antibiotic-Free Boneless Chicken Breast: ${biz.currency} 4.99 / lb
- Grass-Fed Ground Beef (85/15, 1 lb): ${biz.currency} 6.99
`,
      },
      {
        title: `${biz.name} - Hours, Delivery Zones & Policies`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Store Hours, Delivery & Policies

## Store Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Curbside Pickup: Free pickup on all orders over ${biz.currency} 35.

## Store Hours
- Monday to Saturday: 7:00 AM - 10:00 PM
- Sunday: 8:00 AM - 9:00 PM

## Home Delivery Guidelines
- We deliver within a 10-mile radius of our store location.
- Free delivery on orders exceeding ${biz.currency} 50. Flat ${biz.currency} 4.99 fee for smaller orders.
- Same-day delivery slots available when orders are placed before 4:00 PM.

## Return & Freshness Guarantee
- 100% Freshness Guarantee: If you are not satisfied with any fresh fruit, vegetable, or meat, bring it back within 3 days for a full refund or replacement.
`,
      },
      {
        title: `${biz.name} - Frequently Asked Questions (FAQ)`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions (FAQ)

Q: How does curbside pickup work?
A: Place your order via our online chat or app. Park in designated curbside bays 1-6 and send us your bay number — our staff loads your groceries directly into your trunk.

Q: Do you accept SNAP / EBT cards?
A: Yes! We accept SNAP / EBT payments both in-store and online for all eligible grocery and produce items.

Q: Do you have a loyalty rewards program?
A: Yes! Sign up with your mobile number to earn 1 point for every dollar spent. 100 points = ${biz.currency} 5 reward on your next checkout.

Q: How are refrigerated and frozen items handled during delivery?
A: All refrigerated and frozen groceries are transported in temperature-controlled thermal coolers with dry ice packs.
`,
      },
    ],
  },
  {
    id: "VEHICLE_SERVICE",
    name: "Vehicle Service & Garage",
    category: "Automotive Services",
    description: "Oil change, brake repair, periodic maintenance packages & diagnostics rates",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Service Packages & Labor Rates`,
        category: "PRICING",
        content: `# ${biz.name} - Vehicle Maintenance & Repair Pricing

## Routine Maintenance Packages
- Full Synthetic Oil & Filter Change: ${biz.currency} 79.99 (Up to 5 quarts, includes 25-point safety inspection)
- Conventional Oil Change: ${biz.currency} 49.99 (Includes top-off of all fluids & tire check)
- Tire Rotation & Balance (Set of 4): ${biz.currency} 39.99
- Complete Brake Pad Replacement (Per Axle): ${biz.currency} 189.99 (Ceramic pads + hardware inspection)
- Brake Rotor Resurfacing / Replacement: ${biz.currency} 120 - ${biz.currency} 220 per axle

## Diagnostics & Electrical
- OBD2 Check Engine Light Diagnostic: ${biz.currency} 69.99 (Waived if repair work performed with us)
- Battery Health Test & Charging System Check: Free
- Air Conditioning Performance Recharge & Leak Test: ${biz.currency} 119.99
- Wheel Alignment (Laser 4-Wheel): ${biz.currency} 89.99

## General Mechanical Labor
- Standard Garage Labor Rate: ${biz.currency} 110 / hour
- All parts sourced come with a 12-month / 12,000-mile nationwide warranty.
`,
      },
      {
        title: `${biz.name} - Hours, Location & Warranty Policy`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Garage Hours, Location & Warranties

## Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Towing Assistance Partner: Call us for 24/7 flatbed tow dispatch to our garage.

## Operating Hours
- Monday to Friday: 7:30 AM - 6:00 PM
- Saturday: 8:00 AM - 3:00 PM
- Sunday: Closed

## Service Warranty & Guarantee
- 12-Month / 12,000-Mile Guarantee on all mechanical repairs and installed parts.
- We never perform any unauthorized work. Every estimate is approved by you before technicians begin.
`,
      },
      {
        title: `${biz.name} - Customer FAQ`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions (FAQ)

Q: Do I need an appointment for an oil change or safety check?
A: Appointments guarantee quick 30-minute turnaround, but walk-ins are always welcomed for quick services.

Q: Can I drop off my car before opening or after hours?
A: Yes! We have a secure 24/7 Key Drop Box located next to bay door #1. Simply lock your car, fill out the drop envelope, and deposit your keys.

Q: Do you provide loaner vehicles or shuttle rides?
A: We provide complimentary Lyft / Uber rides within a 10-mile radius while your car is being serviced.

Q: Do you service European and Hybrid vehicles?
A: Yes, our ASE-certified mechanics are certified to service BMW, Audi, Mercedes, Toyota hybrids, and Tesla basic suspension/brake components.
`,
      },
    ],
  },
  {
    id: "GENERAL_RETAIL",
    name: "General Business / Services",
    category: "General Commerce",
    description: "Standard business profile, pricing sheet, return policy & customer FAQs",
    defaultName: "",
    documents: (biz) => [
      {
        title: `${biz.name} - Services & Pricing Overview`,
        category: "PRICING",
        content: `# ${biz.name} - Services & Pricing Overview

## Core Offerings & Pricing
- Standard Consultation / Assessment: ${biz.currency} 85.00
- Essential Service Package: ${biz.currency} 150.00
- Professional / Comprehensive Package: ${biz.currency} 295.00
- Custom Enterprise Project: Tailored quotes upon request
- Hourly Rate for Ad-Hoc Assistance: ${biz.currency} 65.00 / hour

## Discounts & Special Terms
- First-time customer discount: 10% off with promo code WELCOME10
- Volume / Referral bonus: ${biz.currency} 25 credit for every customer referred
`,
      },
      {
        title: `${biz.name} - Hours, Location & Contact Details`,
        category: "HOURS_LOCATION",
        content: `# ${biz.name} - Hours, Location & Contact

## Office Location & Contact Details
- Company Name: ${biz.name}
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Email: info@${biz.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com
- Customer Support: Available 24/7 via website live chat

## Regular Operating Hours
- Monday to Friday: 9:00 AM - 6:00 PM
- Saturday: 10:00 AM - 4:00 PM
- Sunday: Closed (Emergency inquiries monitored via live chat)
`,
      },
      {
        title: `${biz.name} - Customer FAQ & Policies`,
        category: "FAQ",
        content: `# ${biz.name} - Frequently Asked Questions & Policies

## Frequently Asked Questions (FAQ)

Q: How can I place an order or book a service?
A: You can book directly with our AI assistant right here on our website or call us at ${biz.phone || "[ADD YOUR PHONE NUMBER]"}.

Q: What payment methods are accepted?
A: We accept all major Credit Cards (Visa, Mastercard, Amex), Apple Pay, Google Pay, Bank Transfers, and Cash.

Q: What is your cancellation or refund policy?
A: Services can be cancelled up to 24 hours in advance for a full refund. Physical products may be returned within 14 days in original packaging with receipt.

Q: How quickly do you respond to customer requests?
A: Our AI staff answers immediately 24/7. Complex requests escalated to our management team are addressed within 2 business hours.
`,
      },
    ],
  },
];

const RAW_DOC_TEMPLATES: IndividualDocTemplate[] = [
  {
    id: "pricing-menu",
    title: "Services & Pricing Menu",
    category: "Pricing & Services",
    description: "Clean tiered pricing table for services, products, or salon/restaurant menus",
    generateContent: (biz) => `# ${biz.name} - Services & Pricing Menu

## Core Services & Offerings
- Standard Service 1: ${biz.currency} 45.00 (Estimated duration: 30 minutes)
- Standard Service 2: ${biz.currency} 75.00 (Estimated duration: 60 minutes)
- Premium Comprehensive Package: ${biz.currency} 140.00 (Includes consultation & warranty)
- Express Add-on / Enhancement: ${biz.currency} 25.00

## Payment Methods Accepted
- Major Credit & Debit Cards (Visa, Mastercard, Amex)
- Contactless payments (Apple Pay, Google Pay)
- Cash & Bank Transfer
`,
  },
  {
    id: "hours-location",
    title: "Operating Hours & Location",
    category: "Contact & Hours",
    description: "Detailed address, parking instructions, phone, and weekly schedule",
    generateContent: (biz) => `# ${biz.name} - Hours, Location & Contact Details

## Location & Contact
- Address: ${biz.address || "[ADD YOUR ADDRESS]"}
- Phone: ${biz.phone || "[ADD YOUR PHONE NUMBER]"}
- Parking: Convenient customer parking available on site.

## Business Schedule
- Monday to Friday: 9:00 AM - 6:00 PM
- Saturday: 10:00 AM - 4:00 PM
- Sunday: Closed
`,
  },
  {
    id: "faq-top10",
    title: "Top 10 Customer FAQs",
    category: "Customer Support",
    description: "Answers to common customer questions regarding booking, payments, and timing",
    generateContent: (biz) => `# ${biz.name} - Frequently Asked Questions (FAQ)

Q: How do I book an appointment or place an order?
A: You can book directly with our AI assistant right now, or call us at ${biz.phone || "[ADD YOUR PHONE NUMBER]"}.

Q: Do you accept walk-ins or do I need a reservation?
A: Walk-ins are welcomed subject to capacity, but reserving in advance guarantees your time slot.

Q: What payment options do you support?
A: We accept all credit/debit cards, Apple Pay, Google Pay, and Cash.

Q: What is your cancellation or refund policy?
A: Cancellations made at least 24 hours before your scheduled time are fully refundable.

Q: Where are you located and is parking free?
A: We are located at ${biz.address || "[ADD YOUR ADDRESS]"}. Complimentary customer parking is available.
`,
  },
  {
    id: "refund-policy",
    title: "Return, Refund & Exchange Policy",
    category: "Policies & Terms",
    description: "Clear customer return windows, receipt requirements, and refund processes",
    generateContent: (biz) => `# ${biz.name} - Return, Refund & Exchange Policy

## Returns & Exchanges
- Items in original, unopened condition may be returned within 14 days of purchase.
- Please retain your receipt or digital order confirmation to process any return.
- Defective items will be replaced or refunded immediately within 30 days.

## Service Satisfaction Guarantee
- If you are not satisfied with a service, contact our manager within 48 hours for a complimentary touch-up or resolution.
`,
  },
  {
    id: "warranty-terms",
    title: "Product Warranty & Repair Terms",
    category: "Policies & Terms",
    description: "Warranty duration, what is covered vs not covered, and claim process",
    generateContent: (biz) => `# ${biz.name} - Warranty & Guarantee Terms

## Warranty Coverage
- All hardware repairs and parts include a 90-day parts and labor warranty.
- Warranty covers manufacturer defects, component failures, and installation quality.
- Warranty does not cover accidental physical damage, water damage, or unauthorized third-party tampering.

## How to Claim
- Bring your receipt or device to our store at ${biz.address || "[ADD YOUR ADDRESS]"}.
- Our team will inspect the item on the spot and resolve the claim promptly.
`,
  },
];

/**
 * Starter packs and single templates are EXAMPLES: their prices, policies and
 * warranty terms are illustrations, not this business's facts. Each document
 * starts with this banner, and saving is blocked (hasUnfilledExample) until the
 * owner has replaced the examples, filled every [ADD …] blank and deleted the
 * banner — otherwise the AI would quote invented prices to real customers.
 */
export const EXAMPLE_MARKER =
  "> EXAMPLE — replace every price, policy and detail below with this business's real information, fill each [ADD …] blank, then delete this line.";

export function hasUnfilledExample(text: string): boolean {
  return text.includes(EXAMPLE_MARKER) || /\[ADD [A-Z ]+\]/.test(text);
}

export const INDUSTRY_STARTER_PACKS: IndustryStarterPack[] = RAW_STARTER_PACKS.map((pack) => ({
  ...pack,
  documents: (biz) => pack.documents(biz).map((d) => ({ ...d, content: `${EXAMPLE_MARKER}\n\n${d.content}` })),
}));

export const INDIVIDUAL_DOC_TEMPLATES: IndividualDocTemplate[] = RAW_DOC_TEMPLATES.map((t) => ({
  ...t,
  generateContent: (biz) => `${EXAMPLE_MARKER}\n\n${t.generateContent(biz)}`,
}));

export function compileCustomBusinessDocs(data: {
  businessName: string;
  phone: string;
  email?: string;
  address: string;
  hours: string;
  services: string;
  policies: string;
  faqs?: string;
  currency: string;
}): BusinessTemplateDoc[] {
  const bizName = data.businessName.trim() || "Our Business";
  const docs: BusinessTemplateDoc[] = [];

  // Document 1: Overview, Hours & Contact
  docs.push({
    title: `${bizName} - Hours, Location & Contact Details`,
    category: "HOURS_LOCATION",
    content: `# ${bizName} - Official Contact & Operating Hours

## Business Information & Contact
- Business Name: ${bizName}
${data.phone.trim() ? `- Phone: ${data.phone.trim()}\n` : ""}${data.email?.trim() ? `- Email: ${data.email.trim()}\n` : ""}${data.address.trim() ? `- Physical Address: ${data.address.trim()}` : ""}

## Operating Hours
${data.hours.trim() || "[ADD YOUR OPENING HOURS]"}

## Customer Service
- Live AI Assistant: Available 24/7 for customer inquiries, booking, and assistance.
`,
  });

  // Document 2: Services & Pricing
  if (data.services.trim()) {
    docs.push({
      title: `${bizName} - Services & Pricing Menu`,
      category: "PRICING",
      content: `# ${bizName} - Services, Products & Pricing

${data.services.trim()}

## Currency & Payment Methods
- All listed prices are in ${data.currency}.
- Payments accepted: Major Credit/Debit cards, contactless pay (Apple/Google Pay), cash.
`,
    });
  }

  // Document 3: Policies & Guarantees
  if (data.policies.trim()) {
    docs.push({
      title: `${bizName} - Customer Policies & Guarantees`,
      category: "POLICIES",
      content: `# ${bizName} - Customer Policies & Guarantees

${data.policies.trim()}
`,
    });
  }

  // Document 4: FAQs if provided
  if (data.faqs?.trim()) {
    docs.push({
      title: `${bizName} - Frequently Asked Questions (FAQ)`,
      category: "FAQ",
      content: `# ${bizName} - Frequently Asked Questions (FAQ)

${data.faqs.trim()}
`,
    });
  }

  return docs;
}
