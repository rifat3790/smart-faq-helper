# AGENTS.md — Developer & AI Agent Guidelines
# Smart FAQ & Help Center (Shopify App)

Welcome to the **Smart FAQ & Help Center** repository. This document provides complete architectural context, development workflows, standards, and rules for AI assistants (Antigravity, Cursor, Claude Code, Copilot) and human developers contributing to this codebase.

---

## 1. Project Overview & Tech Stack

**Smart FAQ & Help Center** is a modern, high-performance Shopify application built for merchants to create, organize, customize, and display intelligent FAQ and Help Center sections across their storefronts.

### Technology Stack:
- **Framework:** React Router 7 / Remix (Server-side rendering, Loaders & Actions)
- **Shopify Admin UI:** Shopify Polaris (v12+) + `@shopify/app-bridge-react`
- **Database & ORM:** PostgreSQL (Neon Serverless DB) + Prisma ORM (`@prisma/client`)
- **Session Storage:** `@shopify/shopify-app-session-storage-prisma`
- **Shopify Platform Tools:** Shopify CLI (`shopify app dev`, `shopify app deploy`)
- **Storefront Theme Extension:** Shopify Online Store 2.0 (OS 2.0) App Blocks & App Embeds (Liquid, Vanilla CSS, lightweight Vanilla JS)
- **API & Storefront Communication:** Shopify App Proxy (`/apps/faq-proxy/...`), GraphQL Admin API, REST Admin API, Shopify Webhooks
- **Language & Runtime:** TypeScript / Node.js (>= 22.12) with Vite bundler

---

## 2. Directory Structure & Key Files

```text
shmart-faq-help-center/
├── app/                                 # Main App Logic (React Router / Remix)
│   ├── routes/                          # Route Handlers (Pages, APIs, Webhooks)
│   │   ├── _index/                      # Public landing/auth redirection
│   │   ├── app._index.tsx               # Admin Dashboard (Polaris UI)
│   │   ├── app.categories.tsx           # Category Management UI & Actions
│   │   ├── app.faqs.tsx                 # FAQ Management & Rich Editor
│   │   ├── app.customizer.tsx           # Visual Settings & Live Preview
│   │   ├── app.analytics.tsx            # Analytics & Zero-Result Search Reports
│   │   ├── app.inquiries.tsx            # Customer Unresolved Questions / Inquiries
│   │   ├── auth.$.tsx                   # Shopify OAuth & Session Token Handler
│   │   ├── api.proxy.search.ts          # Storefront App Proxy Live Search API
│   │   ├── api.proxy.vote.ts            # Storefront "Was this helpful?" Vote API
│   │   ├── api.proxy.contact.ts         # Storefront Question Submission API
│   │   ├── webhooks.app.uninstalled.tsx # App Uninstall Webhook Handler
│   │   └── webhooks.app.scopes_update.tsx # Scope Update Webhook Handler
│   ├── db.server.ts                     # Prisma Client singleton
│   ├── shopify.server.ts                # Shopify App initialization & auth helper
│   ├── entry.server.tsx                 # SSR Entry Point
│   ├── root.tsx                         # Root layout
│   └── routes.ts                        # React Router route definitions
├── extensions/                          # Shopify Theme App Extensions (OS 2.0)
│   └── theme-faq-extension/             # Storefront blocks & embeds
│       ├── blocks/                      # Liquid App Blocks (FAQ Section, Product Tab)
│       ├── snippets/                    # Liquid Reusable Snippets
│       ├── assets/                      # Storefront Vanilla JS & CSS (< 15KB)
│       └── locales/                     # Storefront translations
├── prisma/
│   └── schema.prisma                    # Database Schema (Neon PostgreSQL)
├── public/                              # Static public assets
├── .env                                 # Environment variables (SHOPIFY_API_KEY, DATABASE_URL)
├── shopify.app.toml                     # Shopify App configuration & scopes
├── shopify.web.toml                     # Shopify Web process configuration
├── vite.config.ts                       # Vite build configuration
├── tsconfig.json                        # TypeScript configuration
├── package.json                         # Dependencies & npm scripts
├── SRS.md                               # Software Requirements Specification (Source of Truth)
└── AGENTS.md                            # Agent & Developer Guide (This file)
```

---

## 3. Essential Commands & Development Workflow

### 3.1 Local Development & Server
```bash
# Start Shopify dev server (spawns tunnel, links to dev store, starts backend & extension watchers)
npm run dev
# Or with specific store
npx shopify app dev --store=your-dev-store.myshopify.com

# Build application for production
npm run build

# Typecheck and linting
npm run typecheck
npm run lint
```

### 3.2 Database & Prisma Workflow (Neon PostgreSQL)
```bash
# Push Prisma schema changes directly to Neon PostgreSQL (Development)
npx prisma db push

# Generate fresh Prisma Client
npx prisma generate

# Open interactive Prisma Studio in browser
npx prisma studio

# Create & apply versioned migration (Production / Staging)
npx prisma migrate dev --name <migration_name>
```

### 3.3 Shopify App Extensions & Deployment
```bash
# Generate new Theme App Extension or Webhook
npm run generate

# Deploy all configurations, extensions, and metaobject definitions to Shopify
npm run deploy

# Link or switch active app configuration
npm run config:link
npm run config:use
```

---

## 4. Architectural Rules & Coding Standards

### 4.1 Strict Multi-Tenant Isolation (CRITICAL)
Every merchant store is an isolated tenant identified by their `shop` domain (e.g., `store.myshopify.com`).
- **Rule:** Every database query (SELECT, INSERT, UPDATE, DELETE) **MUST** include `where: { shop: session.shop }` or reference a parent entity owned by that `shop`.
- **Never** perform unscoped updates or queries across tables.

### 4.2 Authentication & Authorization Patterns
1. **Admin Embedded Routes (`/app/*`):**
   - Always authenticate using `@shopify/shopify-app-react-router`:
     ```typescript
     import { authenticate } from "~/shopify.server";
     
     export const loader = async ({ request }: LoaderFunctionArgs) => {
       const { session, admin } = await authenticate.admin(request);
       const shop = session.shop;
       // ... fetch data scoped to shop
     };
     ```
2. **Storefront App Proxy Endpoints (`/api/proxy/*` or `/apps/faq-proxy/*`):**
   - Always verify Shopify proxy signature:
     ```typescript
     export const loader = async ({ request }: LoaderFunctionArgs) => {
       const { session, liquid } = await authenticate.public.appProxy(request);
       // Validate HMAC signature provided by Shopify automatically
     };
     ```
3. **Webhooks (`/webhooks/*`):**
   - Always authenticate incoming webhooks via `authenticate.webhook(request)` to verify HMAC before executing side effects.

### 4.3 Database Best Practices (Prisma + Neon PostgreSQL)
- **Connection Pooling:** Ensure `DATABASE_URL` in `.env` connects to Neon's connection pooler endpoint (`-pooler` host) to handle concurrent burst requests.
- **Index Optimization:** Every foreign key (`shopId`, `categoryId`, `faqId`) and search query column (`shop`, `isPublished`, `sortOrder`) must have an `@index` in `prisma/schema.prisma`.
- **Soft Deletion / Status Flags:** Use `isPublished` / `status` enum flags instead of immediate destructive deletes where appropriate.

### 4.4 Shopify Polaris UI Standards
- Use official Polaris v12+ components: `<Page>`, `<Layout>`, `<Card>`, `<BlockStack>`, `<InlineStack>`, `<IndexTable>`, `<TextField>`, `<Banner>`, `<Modal>`.
- Always provide feedback on actions using Shopify App Bridge Toast (`shopify.toast.show("Changes saved")`).
- Use contextual `<SaveBar>` when forms are dirty.
- Support responsive layout for mobile and desktop screens.

### 4.5 Storefront Theme App Extension Standards (OS 2.0)
- **Zero Heavy Dependencies:** Use **Vanilla JavaScript** and **Pure CSS**. No jQuery, React, or heavy NPM packages inside storefront theme extensions.
- **Bundle Footprint:** JS bundle must remain strictly **under 15KB gzipped**.
- **Accessibility (a11y):** Accordions must include `aria-expanded`, `aria-controls`, `role="region"`, and handle keyboard events (`Enter`, `Space`, `ArrowUp`, `ArrowDown`).
- **SEO Rich Snippets:** Embed clean, valid `Schema.org/FAQPage` JSON-LD via Liquid blocks.
- **Theme Color & Font Inheritance:** CSS should utilize CSS custom properties (`var(--font-body-family, inherit)`, `currentColor`) so widgets harmonize naturally with any Shopify theme.

---

## 5. Core Data Model Reference (High-Level)

| Model Name | Purpose | Key Relations |
| :--- | :--- | :--- |
| **`Session`** | Shopify session token & access token storage | Managed by Shopify Session Storage |
| **`ShopSetting`** | Global app settings, colors, layout, SEO toggles | 1-to-1 with `Shop` / `shop` domain |
| **`FaqCategory`** | Organizes FAQs by topic (e.g. Shipping, Returns) | 1-to-many with `FaqItem` |
| **`FaqItem`** | Individual questions, answers (rich text), sort index | Belongs to `FaqCategory`, 1-to-many `FaqProductTarget` |
| **`FaqProductTarget`** | Maps FAQs to specific Product GIDs or Collection GIDs | Belongs to `FaqItem` |
| **`FaqVote`** | Records helpful / unhelpful customer feedback votes | Belongs to `FaqItem` |
| **`SearchLog`** | Logs customer search keywords and zero-result queries | Scoped by `shop` |
| **`CustomerInquiry`**| Captures unanswered questions submitted by shoppers | Scoped by `shop` |

---

## 6. AI Agent Execution Directives

When implementing features or modifying code in this repository:
1. **Always refer to [SRS.md](file:///d:/Shopify/First%20Shopify%20App/shmart-faq-help-center/SRS.md)** for detailed feature specifications and acceptance criteria.
2. **Never break existing Shopify App Bridge or Session mechanics.**
3. **Verify linting and types** after code edits (`npm run typecheck`).
4. **Use the Shopify AI Toolkit** (`https://shopify.dev/docs/apps/build/ai-toolkit`) for platform API reference.
5. **Keep file paths clickable** in responses using markdown `[file_name](file:///path/to/file)` format.
6. **Prioritize clean, modular, and self-documenting code.**

---

*Document version: 1.0.0 — Updated for Smart FAQ & Help Center*
