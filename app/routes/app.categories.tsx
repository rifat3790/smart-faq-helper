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

  const categories = await prisma.faqCategory.findMany({
    where: { shop },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: { faqs: true },
      },
    },
  });

  const totalCategories = categories.length;
  const activeCategories = categories.filter((c) => c.isPublished).length;

  return {
    categories,
    stats: {
      totalCategories,
      activeCategories,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "CREATE") {
    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const icon = (formData.get("icon") as string)?.trim() || "help";
    const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);
    const isPublished = formData.get("isPublished") === "true";

    if (!title) {
      return { success: false, error: "Title is required" };
    }

    const category = await prisma.faqCategory.create({
      data: {
        shop,
        title,
        description,
        icon,
        sortOrder,
        isPublished,
      },
    });

    return { success: true, action: "CREATED", category };
  }

  if (intent === "UPDATE") {
    const id = formData.get("id") as string;
    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const icon = (formData.get("icon") as string)?.trim() || "help";
    const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);
    const isPublished = formData.get("isPublished") === "true";

    if (!id || !title) {
      return { success: false, error: "Category ID and Title are required" };
    }

    await prisma.faqCategory.updateMany({
      where: { id, shop },
      data: {
        title,
        description,
        icon,
        sortOrder,
        isPublished,
      },
    });

    return { success: true, action: "UPDATED" };
  }

  if (intent === "DELETE") {
    const id = formData.get("id") as string;
    if (!id) return { success: false, error: "Category ID is required" };

    await prisma.faqCategory.deleteMany({
      where: { id, shop },
    });

    return { success: true, action: "DELETED" };
  }

  if (intent === "TOGGLE_STATUS") {
    const id = formData.get("id") as string;
    const currentStatus = formData.get("currentStatus") === "true";

    await prisma.faqCategory.updateMany({
      where: { id, shop },
      data: {
        isPublished: !currentStatus,
      },
    });

    return { success: true, action: "STATUS_TOGGLED" };
  }

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

  return { success: false, error: "Invalid intent" };
};

export default function CategoriesRoute() {
  const { categories, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("help");
  const [formSortOrder, setFormSortOrder] = useState("0");
  const [formIsPublished, setFormIsPublished] = useState(true);

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.action === "CREATED") {
        shopify.toast.show("Category created successfully");
        setIsCreateOpen(false);
        resetForm();
      } else if (fetcher.data.action === "UPDATED") {
        shopify.toast.show("Category updated");
        setEditingCategory(null);
        resetForm();
      } else if (fetcher.data.action === "DELETED") {
        shopify.toast.show("Category deleted");
      } else if (fetcher.data.action === "STATUS_TOGGLED") {
        shopify.toast.show("Visibility updated");
      } else if (fetcher.data.action === "SEEDED") {
        shopify.toast.show("Default categories & FAQs installed!");
      }
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormIcon("help");
    setFormSortOrder("0");
    setFormIsPublished(true);
  };

  const handleOpenEdit = (cat: any) => {
    setEditingCategory(cat);
    setFormTitle(cat.title);
    setFormDescription(cat.description || "");
    setFormIcon(cat.icon || "help");
    setFormSortOrder(cat.sortOrder.toString());
    setFormIsPublished(cat.isPublished);
  };

  const handleSaveCreate = () => {
    if (!formTitle.trim()) {
      shopify.toast.show("Please enter a category title", { isError: true });
      return;
    }

    fetcher.submit(
      {
        intent: "CREATE",
        title: formTitle,
        description: formDescription,
        icon: formIcon,
        sortOrder: formSortOrder,
        isPublished: formIsPublished.toString(),
      },
      { method: "POST" }
    );
  };

  const handleSaveEdit = () => {
    if (!formTitle.trim() || !editingCategory) return;

    fetcher.submit(
      {
        intent: "UPDATE",
        id: editingCategory.id,
        title: formTitle,
        description: formDescription,
        icon: formIcon,
        sortOrder: formSortOrder,
        isPublished: formIsPublished.toString(),
      },
      { method: "POST" }
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      fetcher.submit({ intent: "DELETE", id }, { method: "POST" });
    }
  };

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    fetcher.submit(
      { intent: "TOGGLE_STATUS", id, currentStatus: currentStatus.toString() },
      { method: "POST" }
    );
  };

  const handleSeedDefaults = () => {
    fetcher.submit({ intent: "SEED_DEFAULTS" }, { method: "POST" });
  };

  const iconOptions = [
    { value: "shipping", label: "🚚 Shipping & Delivery" },
    { value: "return", label: "🔄 Returns & Exchanges" },
    { value: "payment", label: "💳 Payments & Billing" },
    { value: "order", label: "📦 Orders & Tracking" },
    { value: "product", label: "🏷️ Product Details & Size" },
    { value: "account", label: "👤 Account & Login" },
    { value: "help", label: "❓ General Help" },
  ];

  return (
    <s-page heading="FAQ Categories">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => {
          resetForm();
          setIsCreateOpen(true);
        }}
      >
        Create Category
      </s-button>

      {/* Overview Statistics Banner */}
      <s-section heading="Overview">
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "160px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total Categories</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.totalCategories}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "160px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Active / Published</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.activeCategories}</div>
          </div>

          {categories.length === 0 && (
            <s-button onClick={handleSeedDefaults} {...(isLoading ? { loading: true } : {})}>
              ⚡ Install Starter FAQ Categories
            </s-button>
          )}
        </div>
      </s-section>

      {/* Main Category List */}
      <s-section heading="All Categories">
        {categories.length === 0 ? (
          <div style={{ padding: "32px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", textAlign: "center" }}>
            <s-heading>No FAQ Categories Found</s-heading>
            <p style={{ color: "#6d7175", margin: "12px 0 20px" }}>
              Organize your FAQs into topics like Shipping, Returns, and Orders to help customers find answers quickly.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <s-button
                variant="primary"
                onClick={() => {
                  resetForm();
                  setIsCreateOpen(true);
                }}
              >
                Create Your First Category
              </s-button>
              <s-button onClick={handleSeedDefaults} {...(isLoading ? { loading: true } : {})}>
                Install Starter Templates
              </s-button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e1e3e5",
                  background: cat.isPublished ? "#ffffff" : "#fbfbfb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                  <div
                    style={{
                      fontSize: "24px",
                      width: "44px",
                      height: "44px",
                      borderRadius: "8px",
                      background: "#f1f2f4",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {cat.icon === "shipping"
                      ? "🚚"
                      : cat.icon === "return"
                      ? "🔄"
                      : cat.icon === "payment"
                      ? "💳"
                      : cat.icon === "order"
                      ? "📦"
                      : cat.icon === "product"
                      ? "🏷️"
                      : cat.icon === "account"
                      ? "👤"
                      : "❓"}
                  </div>

                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "15px" }}>{cat.title}</span>
                      <s-badge tone={cat.isPublished ? "success" : "info"}>
                        {cat.isPublished ? "Published" : "Draft"}
                      </s-badge>
                      <s-badge tone="neutral">
                        {cat._count.faqs} {cat._count.faqs === 1 ? "FAQ" : "FAQs"}
                      </s-badge>
                      <span style={{ fontSize: "12px", color: "#6d7175" }}>
                        Sort: #{cat.sortOrder}
                      </span>
                    </div>

                    {cat.description && (
                      <p style={{ margin: "4px 0 0", color: "#6d7175", fontSize: "13px" }}>{cat.description}</p>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <s-button
                    variant="tertiary"
                    onClick={() => handleToggleStatus(cat.id, cat.isPublished)}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    {cat.isPublished ? "Hide" : "Publish"}
                  </s-button>
                  <s-button
                    variant="secondary"
                    onClick={() => handleOpenEdit(cat)}
                  >
                    Edit
                  </s-button>
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    onClick={() => handleDelete(cat.id, cat.title)}
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

      {/* Create Category Modal / Drawer */}
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
              maxWidth: "500px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}>Create FAQ Category</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Category Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shipping & Delivery"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
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
                  Description / Subtitle
                </label>
                <textarea
                  placeholder="Brief summary of questions in this topic"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
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

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                    Category Icon
                  </label>
                  <select
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  >
                    {iconOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
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

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "4px" }}>
                <input
                  type="checkbox"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Publish immediately (visible to storefront)</span>
              </label>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                <s-button onClick={() => setIsCreateOpen(false)}>Cancel</s-button>
                <s-button variant="primary" onClick={handleSaveCreate} {...(isLoading ? { loading: true } : {})}>
                  Save Category
                </s-button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
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
              maxWidth: "500px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}>
              Edit "{editingCategory.title}"
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Category Title *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
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
                  Description / Subtitle
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
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

              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                    Category Icon
                  </label>
                  <select
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  >
                    {iconOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
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

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "4px" }}>
                <input
                  type="checkbox"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Published (visible on storefront)</span>
              </label>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                <s-button onClick={() => setEditingCategory(null)}>Cancel</s-button>
                <s-button variant="primary" onClick={handleSaveEdit} {...(isLoading ? { loading: true } : {})}>
                  Update Category
                </s-button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help & Best Practice Guide */}
      <s-section slot="aside" heading="Category Tips">
        <s-paragraph>
          <strong>Logical Grouping:</strong> Group related FAQs (e.g. <em>Shipping</em>, <em>Refunds</em>, <em>Sizing</em>) to make navigation effortless for customers.
        </s-paragraph>
        <s-paragraph>
          <strong>Sorting:</strong> Lower sort order numbers (e.g. 1, 2) appear first on your storefront.
        </s-paragraph>
        <s-paragraph>
          <strong>Theme Embed:</strong> You can show or hide specific categories directly in the Shopify Theme Editor.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
