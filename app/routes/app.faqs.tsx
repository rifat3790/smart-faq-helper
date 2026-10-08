import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [faqs, categories] = await Promise.all([
    prisma.faqItem.findMany({
      where: { shop },
      include: {
        category: true,
        productTargets: true,
        _count: {
          select: { votes: true },
        },
      },
      orderBy: [
        { isPinned: "desc" },
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
    }),
    prisma.faqCategory.findMany({
      where: { shop },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const totalFaqs = faqs.length;
  const publishedFaqs = faqs.filter((f) => f.isPublished).length;
  const totalHelpful = faqs.reduce((acc, f) => acc + f.helpfulCount, 0);
  const totalUnhelpful = faqs.reduce((acc, f) => acc + f.unhelpfulCount, 0);

  return {
    faqs,
    categories,
    stats: {
      totalFaqs,
      publishedFaqs,
      totalHelpful,
      totalUnhelpful,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "CREATE") {
    const question = (formData.get("question") as string)?.trim();
    const answer = (formData.get("answer") as string)?.trim();
    const categoryId = (formData.get("categoryId") as string) || null;
    const tags = (formData.get("tags") as string)?.trim() || null;
    const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);
    const isPublished = formData.get("isPublished") === "true";
    const isGlobal = formData.get("isGlobal") === "true";
    const isPinned = formData.get("isPinned") === "true";

    if (!question || !answer) {
      return { success: false, error: "Question and Answer are required" };
    }

    const faq = await prisma.faqItem.create({
      data: {
        shop,
        question,
        answer,
        categoryId: categoryId === "none" || !categoryId ? null : categoryId,
        tags,
        sortOrder,
        isPublished,
        isGlobal,
        isPinned,
      },
    });

    return { success: true, action: "CREATED", faq };
  }

  if (intent === "UPDATE") {
    const id = formData.get("id") as string;
    const question = (formData.get("question") as string)?.trim();
    const answer = (formData.get("answer") as string)?.trim();
    const categoryId = (formData.get("categoryId") as string) || null;
    const tags = (formData.get("tags") as string)?.trim() || null;
    const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);
    const isPublished = formData.get("isPublished") === "true";
    const isGlobal = formData.get("isGlobal") === "true";
    const isPinned = formData.get("isPinned") === "true";

    if (!id || !question || !answer) {
      return { success: false, error: "FAQ ID, Question, and Answer are required" };
    }

    await prisma.faqItem.updateMany({
      where: { id, shop },
      data: {
        question,
        answer,
        categoryId: categoryId === "none" || !categoryId ? null : categoryId,
        tags,
        sortOrder,
        isPublished,
        isGlobal,
        isPinned,
      },
    });

    return { success: true, action: "UPDATED" };
  }

  if (intent === "DELETE") {
    const id = formData.get("id") as string;
    if (!id) return { success: false, error: "FAQ ID is required" };

    await prisma.faqItem.deleteMany({
      where: { id, shop },
    });

    return { success: true, action: "DELETED" };
  }

  if (intent === "TOGGLE_STATUS") {
    const id = formData.get("id") as string;
    const currentStatus = formData.get("currentStatus") === "true";

    await prisma.faqItem.updateMany({
      where: { id, shop },
      data: { isPublished: !currentStatus },
    });

    return { success: true, action: "STATUS_TOGGLED" };
  }

  if (intent === "TOGGLE_PIN") {
    const id = formData.get("id") as string;
    const currentPin = formData.get("currentPin") === "true";

    await prisma.faqItem.updateMany({
      where: { id, shop },
      data: { isPinned: !currentPin },
    });

    return { success: true, action: "PIN_TOGGLED" };
  }

  return { success: false, error: "Invalid intent" };
};

export default function FaqsRoute() {
  const { faqs, categories, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<any | null>(null);

  // Filter states
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("none");
  const [formTags, setFormTags] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formIsGlobal, setFormIsGlobal] = useState(true);
  const [formIsPinned, setFormIsPinned] = useState(false);

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.action === "CREATED") {
        shopify.toast.show("FAQ created successfully");
        setIsCreateOpen(false);
        resetForm();
      } else if (fetcher.data.action === "UPDATED") {
        shopify.toast.show("FAQ updated successfully");
        setEditingFaq(null);
        resetForm();
      } else if (fetcher.data.action === "DELETED") {
        shopify.toast.show("FAQ deleted");
      } else if (fetcher.data.action === "STATUS_TOGGLED") {
        shopify.toast.show("Visibility updated");
      } else if (fetcher.data.action === "PIN_TOGGLED") {
        shopify.toast.show("Pin status updated");
      }
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const resetForm = () => {
    setFormQuestion("");
    setFormAnswer("");
    setFormCategoryId(categories[0]?.id || "none");
    setFormTags("");
    setFormSortOrder("0");
    setFormIsPublished(true);
    setFormIsGlobal(true);
    setFormIsPinned(false);
  };

  const handleOpenEdit = (faq: any) => {
    setEditingFaq(faq);
    setFormQuestion(faq.question);
    setFormAnswer(faq.answer);
    setFormCategoryId(faq.categoryId || "none");
    setFormTags(faq.tags || "");
    setFormSortOrder(faq.sortOrder.toString());
    setFormIsPublished(faq.isPublished);
    setFormIsGlobal(faq.isGlobal);
    setFormIsPinned(faq.isPinned);
  };

  const handleSaveCreate = () => {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      shopify.toast.show("Please enter both question and answer", { isError: true });
      return;
    }

    fetcher.submit(
      {
        intent: "CREATE",
        question: formQuestion,
        answer: formAnswer,
        categoryId: formCategoryId,
        tags: formTags,
        sortOrder: formSortOrder,
        isPublished: formIsPublished.toString(),
        isGlobal: formIsGlobal.toString(),
        isPinned: formIsPinned.toString(),
      },
      { method: "POST" }
    );
  };

  const handleSaveEdit = () => {
    if (!formQuestion.trim() || !formAnswer.trim() || !editingFaq) return;

    fetcher.submit(
      {
        intent: "UPDATE",
        id: editingFaq.id,
        question: formQuestion,
        answer: formAnswer,
        categoryId: formCategoryId,
        tags: formTags,
        sortOrder: formSortOrder,
        isPublished: formIsPublished.toString(),
        isGlobal: formIsGlobal.toString(),
        isPinned: formIsPinned.toString(),
      },
      { method: "POST" }
    );
  };

  const handleDelete = (id: string, question: string) => {
    if (confirm(`Are you sure you want to delete this FAQ: "${question}"?`)) {
      fetcher.submit({ intent: "DELETE", id }, { method: "POST" });
    }
  };

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    fetcher.submit(
      { intent: "TOGGLE_STATUS", id, currentStatus: currentStatus.toString() },
      { method: "POST" }
    );
  };

  const handleTogglePin = (id: string, currentPin: boolean) => {
    fetcher.submit(
      { intent: "TOGGLE_PIN", id, currentPin: currentPin.toString() },
      { method: "POST" }
    );
  };

  // Filtered FAQs
  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory =
      selectedCategoryFilter === "all" ||
      (selectedCategoryFilter === "uncategorized" && !faq.categoryId) ||
      faq.categoryId === selectedCategoryFilter;

    const matchesSearch =
      searchQuery === "" ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (faq.tags && faq.tags.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <s-page heading="FAQs Management">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => {
          resetForm();
          setIsCreateOpen(true);
        }}
      >
        Add New FAQ
      </s-button>

      {/* Stats Summary */}
      <s-section heading="Overview">
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total Questions</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.totalFaqs}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Published</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.publishedFaqs}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Helpful Feedback</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>👍 {stats.totalHelpful}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Unhelpful Feedback</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>👎 {stats.totalUnhelpful}</div>
          </div>
        </div>
      </s-section>

      {/* Filters & Search Bar */}
      <s-section heading="Manage Questions">
        <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search questions, answers, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              fontSize: "14px",
              minWidth: "220px",
            }}
          />

          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              fontSize: "14px",
              minWidth: "180px",
            }}
          >
            <option value="all">All Categories</option>
            <option value="uncategorized">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {/* FAQ Items Listing */}
        {filteredFaqs.length === 0 ? (
          <div style={{ padding: "32px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", textAlign: "center" }}>
            <s-heading>No FAQs Found</s-heading>
            <p style={{ color: "#6d7175", margin: "12px 0 20px" }}>
              {searchQuery || selectedCategoryFilter !== "all"
                ? "Try changing your search query or category filter."
                : "Start answering common questions about shipping, returns, sizing, and product care."}
            </p>
            <s-button
              variant="primary"
              onClick={() => {
                resetForm();
                setIsCreateOpen(true);
              }}
            >
              Create Your First FAQ
            </s-button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredFaqs.map((faq) => (
              <div
                key={faq.id}
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e1e3e5",
                  background: faq.isPublished ? "#ffffff" : "#fbfbfb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                    {faq.isPinned && (
                      <s-badge tone="caution">📌 Pinned</s-badge>
                    )}
                    <s-badge tone={faq.isPublished ? "success" : "info"}>
                      {faq.isPublished ? "Published" : "Draft"}
                    </s-badge>
                    {faq.category ? (
                      <s-badge tone="neutral">📁 {faq.category.title}</s-badge>
                    ) : (
                      <s-badge tone="neutral">Uncategorized</s-badge>
                    )}
                    {faq.isGlobal && (
                      <s-badge tone="neutral">🌐 Global</s-badge>
                    )}
                    <span style={{ fontSize: "12px", color: "#6d7175" }}>
                      Sort: #{faq.sortOrder}
                    </span>
                  </div>

                  <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>{faq.question}</h3>
                  <p style={{ margin: 0, color: "#4a4f54", fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {faq.answer.length > 200 ? `${faq.answer.slice(0, 200)}...` : faq.answer}
                  </p>

                  {faq.tags && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "#6d7175" }}>Tags:</span>
                      {faq.tags.split(",").map((tag: string, idx: number) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: "11px",
                            background: "#e4e5e7",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "10px", fontSize: "12px", color: "#6d7175" }}>
                    <span>👁️ {faq.viewCount} views</span>
                    <span>👍 {faq.helpfulCount} helpful</span>
                    <span>👎 {faq.unhelpfulCount} unhelpful</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <s-button
                    variant="tertiary"
                    onClick={() => handleTogglePin(faq.id, faq.isPinned)}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    {faq.isPinned ? "Unpin" : "Pin"}
                  </s-button>
                  <s-button
                    variant="tertiary"
                    onClick={() => handleToggleStatus(faq.id, faq.isPublished)}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    {faq.isPublished ? "Hide" : "Publish"}
                  </s-button>
                  <s-button
                    variant="secondary"
                    onClick={() => handleOpenEdit(faq)}
                  >
                    Edit
                  </s-button>
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    onClick={() => handleDelete(faq.id, faq.question)}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    Delete
                  </s-button>
                </div>
              </div>
            ))}
          </div>
        )}
      </s-section>

      {/* Create Modal */}
      {isCreateOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "550px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}>Add New FAQ</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Question Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. How do I request a return or refund?"
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Answer Body *
                </label>
                <textarea
                  placeholder="Write your clear, helpful answer here (supports text, lists, links)..."
                  value={formAnswer}
                  onChange={(e) => setFormAnswer(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                    Category
                  </label>
                  <select
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="none">-- No Category (General) --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ width: "120px" }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Search Tags / Keywords (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. return, exchange, refund, money back"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formIsPublished}
                    onChange={(e) => setFormIsPublished(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>Publish immediately on storefront</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formIsGlobal}
                    onChange={(e) => setFormIsGlobal(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>Show on main FAQ / Help Center page (Global)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formIsPinned}
                    onChange={(e) => setFormIsPinned(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>📌 Pin this FAQ to the top</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                <s-button onClick={() => setIsCreateOpen(false)}>Cancel</s-button>
                <s-button variant="primary" onClick={handleSaveCreate} {...(isLoading ? { loading: true } : {})}>
                  Save FAQ
                </s-button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingFaq && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "550px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}>Edit FAQ</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Question Title *
                </label>
                <input
                  type="text"
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Answer Body *
                </label>
                <textarea
                  value={formAnswer}
                  onChange={(e) => setFormAnswer(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                    Category
                  </label>
                  <select
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="none">-- No Category (General) --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ width: "120px" }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Search Tags / Keywords
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formIsPublished}
                    onChange={(e) => setFormIsPublished(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>Published (visible on storefront)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formIsGlobal}
                    onChange={(e) => setFormIsGlobal(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>Show on main FAQ / Help Center page (Global)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formIsPinned}
                    onChange={(e) => setFormIsPinned(e.target.checked)}
                  />
                  <span style={{ fontSize: "14px" }}>📌 Pin this FAQ to top</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                <s-button onClick={() => setEditingFaq(null)}>Cancel</s-button>
                <s-button variant="primary" onClick={handleSaveEdit} {...(isLoading ? { loading: true } : {})}>
                  Update FAQ
                </s-button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEO & Search Tips */}
      <s-section slot="aside" heading="SEO & Rich Answers">
        <s-paragraph>
          <strong>Google Rich Snippets:</strong> Published FAQs automatically generate Schema.org <code>FAQPage</code> structured data for higher search rankings.
        </s-paragraph>
        <s-paragraph>
          <strong>Search Tags:</strong> Add synonyms (e.g. <em>postage</em>, <em>courier</em>) to tags so customers find answers even if they use different terminology.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
