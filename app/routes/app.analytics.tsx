import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [
    faqs,
    searchLogs,
    zeroResultLogs,
    totalInquiries,
  ] = await Promise.all([
    prisma.faqItem.findMany({
      where: { shop },
      include: { category: true },
      orderBy: { viewCount: "desc" },
    }),
    prisma.searchLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.searchLog.findMany({
      where: { shop, hasZeroResults: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.customerInquiry.count({
      where: { shop },
    }),
  ]);

  const totalViews = faqs.reduce((acc, f) => acc + f.viewCount, 0);
  const totalHelpful = faqs.reduce((acc, f) => acc + f.helpfulCount, 0);
  const totalUnhelpful = faqs.reduce((acc, f) => acc + f.unhelpfulCount, 0);
  const totalVotes = totalHelpful + totalUnhelpful;
  const satisfactionRate = totalVotes > 0 ? Math.round((totalHelpful / totalVotes) * 100) : 100;

  // Aggregate zero result queries
  const zeroQueryMap = new Map<string, { query: string; count: number; lastSearched: Date }>();
  for (const log of zeroResultLogs) {
    const q = log.query.trim().toLowerCase();
    if (!zeroQueryMap.has(q)) {
      zeroQueryMap.set(q, { query: log.query, count: 1, lastSearched: log.createdAt });
    } else {
      const existing = zeroQueryMap.get(q)!;
      existing.count += 1;
      if (log.createdAt > existing.lastSearched) existing.lastSearched = log.createdAt;
    }
  }
  const topZeroQueries = Array.from(zeroQueryMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);

  // Top helpful FAQs
  const topHelpfulFaqs = [...faqs].sort((a, b) => b.helpfulCount - a.helpfulCount).slice(0, 5);
  // FAQs needing attention (high unhelpful)
  const needsAttentionFaqs = faqs.filter((f) => f.unhelpfulCount > 0).sort((a, b) => b.unhelpfulCount - a.unhelpfulCount).slice(0, 5);

  return {
    stats: {
      totalViews,
      totalSearches: searchLogs.length,
      totalVotes,
      satisfactionRate,
      totalInquiries,
    },
    topZeroQueries,
    topHelpfulFaqs,
    needsAttentionFaqs,
  };
};

export default function AnalyticsRoute() {
  const { stats, topZeroQueries, topHelpfulFaqs, needsAttentionFaqs } = useLoaderData<typeof loader>();

  return (
    <s-page heading="FAQ & Search Analytics">
      {/* Key Metrics */}
      <s-section heading="Performance Overview">
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total FAQ Views</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>👁️ {stats.totalViews}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Helpfulness Score</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.satisfactionRate}% 👍</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total Searches</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>🔍 {stats.totalSearches}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total Inquiries</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>✉️ {stats.totalInquiries}</div>
          </div>
        </div>
      </s-section>

      {/* Zero Result Searches Alert */}
      <s-section heading="🚨 Zero-Result Search Queries (Missing Content Opportunities)">
        <p style={{ color: "#4a4f54", margin: "0 0 16px" }}>
          These are terms searched by customers on your storefront that returned <strong>0 results</strong>. Writing FAQs for these keywords will directly reduce customer support tickets.
        </p>

        {topZeroQueries.length === 0 ? (
          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
            <p style={{ color: "#6d7175", margin: 0 }}>
              🎉 No zero-result queries recorded! All customer searches matched existing FAQs.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {topZeroQueries.map((item, idx) => (
              <div
                key={idx}
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
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <s-badge tone="caution">{item.count} searches</s-badge>
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>"{item.query}"</span>
                </div>
                <s-link href="/app/faqs">Create FAQ for this</s-link>
              </div>
            ))}
          </div>
        )}
      </s-section>

      {/* Top Helpful and Needs Attention FAQs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
        <s-section heading="⭐ Most Helpful FAQs">
          {topHelpfulFaqs.length === 0 ? (
            <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <p style={{ color: "#6d7175", margin: 0 }}>No votes recorded yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {topHelpfulFaqs.map((faq) => (
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
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{faq.question}</span>
                  <s-badge tone="success">👍 {faq.helpfulCount}</s-badge>
                </div>
              ))}
            </div>
          )}
        </s-section>

        <s-section heading="⚠️ FAQs Needing Review">
          {needsAttentionFaqs.length === 0 ? (
            <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5" }}>
              <p style={{ color: "#6d7175", margin: 0 }}>All FAQs have positive feedback!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {needsAttentionFaqs.map((faq) => (
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
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{faq.question}</span>
                  <s-badge tone="critical">👎 {faq.unhelpfulCount}</s-badge>
                </div>
              ))}
            </div>
          )}
        </s-section>
      </div>

      <s-section slot="aside" heading="Analytics Tips">
        <s-paragraph>
          Check your zero-result queries weekly to identify new questions customers are asking as your store grows.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
