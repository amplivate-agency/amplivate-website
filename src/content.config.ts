import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const items = (path: string) => file(path, { parser: (text) => JSON.parse(text).items });

const services = defineCollection({
  loader: items('src/data/services.json'),
  schema: z.object({
    order: z.number(),
    group: z.string(),
    title: z.string(),
    summary: z.string(),
    overview: z.string(),
    benefits: z.array(z.string()),
    whatsIncluded: z.array(z.string()),
    process: z.array(z.object({ title: z.string(), description: z.string() })),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
});

const pricingTiers = defineCollection({
  loader: items('src/data/pricing-tiers.json'),
  schema: z.object({
    order: z.number(),
    name: z.string(),
    price: z.string(),
    priceNote: z.string(),
    tagline: z.string(),
    features: z.array(z.string()),
    ctaLabel: z.string(),
    ctaHref: z.string(),
  }),
});

const addons = defineCollection({
  loader: items('src/data/addons.json'),
  schema: z.object({
    order: z.number(),
    name: z.string(),
    whatItDoes: z.string(),
    whyValuable: z.string(),
    price: z.string(),
    benefits: z.array(z.string()),
  }),
});

const work = defineCollection({
  loader: items('src/data/work.json'),
  schema: z.object({
    order: z.number(),
    featured: z.boolean(),
    isConcept: z.boolean(),
    tag: z.string(),
    title: z.string(),
    text: z.string(),
    images: z.array(z.string()).optional(),
    metrics: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  }),
});

const testimonials = defineCollection({
  loader: items('src/data/testimonials.json'),
  schema: z.object({
    name: z.string(),
    company: z.string(),
    quote: z.string(),
    rating: z.number(),
    photo: z.string().optional(),
  }),
});

const faqs = defineCollection({
  loader: items('src/data/faqs.json'),
  schema: z.object({
    order: z.number(),
    category: z.string(),
    question: z.string(),
    answer: z.string(),
  }),
});

export const collections = { services, pricingTiers, addons, work, testimonials, faqs };
