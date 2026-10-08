import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [categoriesCount, faqs, settings, newInquiriesCount] = await Promise.all([
    prisma.faqCategory.count({ where: { shop } }),
    prisma.faqItem.findMany({
      where: { shop },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.shopSetting.findUnique({ where: { shop } }),
    prisma.customerInquiry.count({ where: { shop, status: "NEW" } }),
  ]);

  const totalFaqs = await prisma.faqItem.count({ where: { shop } });
  const totalViews = faqs.reduce((acc, f) => acc + f.viewCount, 0);
  const totalHelpful = faqs.reduce((acc, f) => acc + f.helpfulCount, 0);
  const totalUnhelpful = faqs.reduce((acc, f) => acc + f.unhelpfulCount, 0);

  return {
    shop,
    stats: {
      categoriesCount,
      totalFaqs,
      totalViews,
      totalHelpful,
      totalUnhelpful,
      newInquiriesCount,
    },
    recentFaqs: faqs,
    hasSettings: !!settings,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "SEED_DEFAULTS") {
    const starterCategories = [
      {
        title: "Shipping & Delivery",
        description: "Delivery times, tracking numbers, and international shipping rates.",
        icon: "shipping",
        sortOrder: 1,
        isPublished: true,
        faqs: [
          {
            question: "How long does standard shipping take?",
            answer: "Standard domestic shipping takes 3-5 business days. International orders typically arrive within 7-14 business days.",
            sortOrder: 1,
            isGlobal: true,
            isPublished: true,
          },
          {
            question: "How can I track my order?",
            answer: "Once your package ships, you will receive an automated shipping confirmation email containing your tracking number and link.",
            sortOrder: 2,
            isGlobal: true,
            isPublished: true,
          },
        ],
      },
      {
        title: "Returns & Exchanges",
        description: "Return policies, exchange process, and refund timelines.",
        icon: "return",
        sortOrder: 2,
        isPublished: true,
        faqs: [
          {
            question: "What is your return policy?",
            answer: "We offer a 30-day money-back guarantee for unused items in original packaging.",
            sortOrder: 1,
            isGlobal: true,
            isPublished: true,
          },
        ],
      },
      {
        title: "Orders & Payments",
        description: "Accepted payment methods, discounts, and order cancellations.",
        icon: "payment",
        sortOrder: 3,
        isPublished: true,
        faqs: [
          {
            question: "Which payment methods do you accept?",
            answer: "We accept Visa, MasterCard, American Express, PayPal, Apple Pay, Google Pay, and Shop Pay.",
            sortOrder: 1,
            isGlobal: true,
            isPublished: true,
          },
        ],
      },
    ];

    for (const cat of starterCategories) {
      const createdCategory = await prisma.faqCategory.create({
        data: {
          shop,
          title: cat.title,
          description: cat.description,
          icon: cat.icon,
          sortOrder: cat.sortOrder,
          isPublished: cat.isPublished,
        },
      });

      for (const faq of cat.faqs) {
        await prisma.faqItem.create({
          data: {
            shop,
            categoryId: createdCategory.id,
            question: faq.question,
            answer: faq.answer,
            sortOrder: faq.sortOrder,
            isGlobal: faq.isGlobal,
            isPublished: faq.isPublished,
          },
        });
      }
    }

    return { success: true, action: "SEEDED" };
  }

  return { success: false, error: "Invalid action" };
};

export default function Index() {
  const { stats, recentFaqs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.action === "SEEDED") {
      shopify.toast.show("Starter FAQ template installed successfully! 🎉");
    }
  }, [fetcher.data, shopify]);

  const handleSeedDefaults = () => {
    fetcher.submit({ intent: "SEED_DEFAULTS" }, { method: "POST" });
  };

  return (
    <s-page heading="Smart FAQ & Help Center">
      {/* Quick Starter Banner if empty */}
      {stats.totalFaqs === 0 && (
        <s-section heading="🚀 Quick Setup Guide">
          <div style={{ padding: "24px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px" }}>Welcome to Smart FAQ & Help Center!</h3>
            <p style={{ margin: "0 0 16px", color: "#6d7175", fontSize: "14px" }}>
              Give your customers instant answers, reduce customer support tickets, and boost conversion rates.
            </p>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <s-button variant="primary" onClick={handleSeedDefaults} {...(isLoading ? { loading: true } : {})}>
                ⚡ 1-Click Install Starter FAQ Templates
              </s-button>
              <s-link href="/app/categories">Create Categories Manually</s-link>
            </div>
          </div>
        </s-section>
      )}

      {/* Analytics Highlights */}
      <s-section heading="Performance Overview">
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Categories</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.categoriesCount}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total FAQs</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.totalFaqs}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Helpful Feedback</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>👍 {stats.totalHelpful}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>New Inquiries</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>✉️ {stats.newInquiriesCount}</div>
          </div>
        </div>
      </s-section>

      {/* Main Navigation Quick Cards */}
      <s-section heading="Quick Management">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>📁 Categories</h4>
            <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 0 12px" }}>
              Organize FAQs into logical topics like Shipping, Returns, and Orders.
            </p>
            <s-link href="/app/categories">Manage Categories →</s-link>
          </div>

          <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>❓ FAQs & Answers</h4>
            <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 0 12px" }}>
              Create, edit, pin, and organize rich text questions and answers.
            </p>
            <s-link href="/app/faqs">Manage FAQs →</s-link>
          </div>

          <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>🎨 Visual Customizer</h4>
            <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 0 12px" }}>
              Customize colors, typography, accordion styles, and live preview.
            </p>
            <s-link href="/app/customizer">Customize Design →</s-link>
          </div>

          <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>✉️ Customer Inquiries</h4>
            <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 0 12px" }}>
              Review questions submitted by customers when they couldn't find an answer.
            </p>
            <s-link href="/app/inquiries">View Inquiries →</s-link>
          </div>

          <div style={{ padding: "16px", background: "#ffffff", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px" }}>📊 Analytics & Zero-Results</h4>
            <p style={{ color: "#6d7175", fontSize: "13px", margin: "0 0 12px" }}>
              Track top searches and uncover missing FAQ keywords.
            </p>
            <s-link href="/app/analytics">View Analytics →</s-link>
          </div>
        </div>
      </s-section>

      {/* Recent FAQs Preview */}
      {recentFaqs.length > 0 && (
        <s-section heading="Recently Added FAQs">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentFaqs.map((faq) => (
              <div
                key={faq.id}
                style={{
                  padding: "12px 16px",
                  background: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e1e3e5",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <s-badge tone={faq.isPublished ? "success" : "info"}>
                    {faq.isPublished ? "Published" : "Draft"}
                  </s-badge>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{faq.question}</span>
                </div>
                <s-link href="/app/faqs">Edit</s-link>
              </div>
            ))}
          </div>
        </s-section>
      )}

      {/* Theme App Extension Embedding Guide */}
      <s-section slot="aside" heading="Storefront Integration">
        <s-paragraph>
          <strong>Online Store 2.0:</strong>
        </s-paragraph>
        <s-paragraph>
          To display FAQs on your store, go to <strong>Online Store → Themes → Customize</strong>, and add the <em>FAQ Section</em> block to any page template.
        </s-paragraph>
        <s-paragraph>
          <strong>SEO Rich Snippets:</strong> Schema.org <code>FAQPage</code> JSON-LD is automatically enabled for top Google rankings.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
