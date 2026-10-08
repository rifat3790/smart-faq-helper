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

  let settings = await prisma.shopSetting.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.shopSetting.create({
      data: {
        shop,
        faqTitle: "Frequently Asked Questions",
        faqSubtitle: "Find quick answers to your questions about our products, shipping, and returns.",
        layoutStyle: "ACCORDION",
        primaryColor: "#008060",
        textColor: "#202223",
        backgroundColor: "#ffffff",
        accordionBgColor: "#f6f6f7",
        borderColor: "#e1e3e5",
        borderRadius: 8,
        fontFamily: "inherit",
        fontSize: 16,
        iconType: "CHEVRON",
        allowMultipleOpen: false,
        openFirstByDefault: true,
        enableSearch: true,
        enableCategoryIcons: true,
        enableFeedback: true,
        enableInquiryForm: true,
        enableSchemaOrg: true,
      },
    });
  }

  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();

  const faqTitle = (formData.get("faqTitle") as string) || "Frequently Asked Questions";
  const faqSubtitle = (formData.get("faqSubtitle") as string) || null;
  const layoutStyle = (formData.get("layoutStyle") as string) || "ACCORDION";
  const primaryColor = (formData.get("primaryColor") as string) || "#008060";
  const textColor = (formData.get("textColor") as string) || "#202223";
  const backgroundColor = (formData.get("backgroundColor") as string) || "#ffffff";
  const accordionBgColor = (formData.get("accordionBgColor") as string) || "#f6f6f7";
  const borderColor = (formData.get("borderColor") as string) || "#e1e3e5";
  const borderRadius = parseInt((formData.get("borderRadius") as string) || "8", 10);
  const fontFamily = (formData.get("fontFamily") as string) || "inherit";
  const fontSize = parseInt((formData.get("fontSize") as string) || "16", 10);
  const iconType = (formData.get("iconType") as string) || "CHEVRON";
  const allowMultipleOpen = formData.get("allowMultipleOpen") === "true";
  const openFirstByDefault = formData.get("openFirstByDefault") === "true";
  const enableSearch = formData.get("enableSearch") === "true";
  const enableCategoryIcons = formData.get("enableCategoryIcons") === "true";
  const enableFeedback = formData.get("enableFeedback") === "true";
  const enableInquiryForm = formData.get("enableInquiryForm") === "true";
  const enableSchemaOrg = formData.get("enableSchemaOrg") === "true";
  const customCss = (formData.get("customCss") as string) || null;

  const updatedSettings = await prisma.shopSetting.upsert({
    where: { shop },
    update: {
      faqTitle,
      faqSubtitle,
      layoutStyle,
      primaryColor,
      textColor,
      backgroundColor,
      accordionBgColor,
      borderColor,
      borderRadius,
      fontFamily,
      fontSize,
      iconType,
      allowMultipleOpen,
      openFirstByDefault,
      enableSearch,
      enableCategoryIcons,
      enableFeedback,
      enableInquiryForm,
      enableSchemaOrg,
      customCss,
    },
    create: {
      shop,
      faqTitle,
      faqSubtitle,
      layoutStyle,
      primaryColor,
      textColor,
      backgroundColor,
      accordionBgColor,
      borderColor,
      borderRadius,
      fontFamily,
      fontSize,
      iconType,
      allowMultipleOpen,
      openFirstByDefault,
      enableSearch,
      enableCategoryIcons,
      enableFeedback,
      enableInquiryForm,
      enableSchemaOrg,
      customCss,
    },
  });

  return { success: true, settings: updatedSettings };
};

export default function CustomizerRoute() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  // Customizer state
  const [faqTitle, setFaqTitle] = useState(settings.faqTitle || "Frequently Asked Questions");
  const [faqSubtitle, setFaqSubtitle] = useState(settings.faqSubtitle || "");
  const [layoutStyle, setLayoutStyle] = useState(settings.layoutStyle || "ACCORDION");
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || "#008060");
  const [textColor, setTextColor] = useState(settings.textColor || "#202223");
  const [backgroundColor, setBackgroundColor] = useState(settings.backgroundColor || "#ffffff");
  const [accordionBgColor, setAccordionBgColor] = useState(settings.accordionBgColor || "#f6f6f7");
  const [borderColor, setBorderColor] = useState(settings.borderColor || "#e1e3e5");
  const [borderRadius, setBorderRadius] = useState(settings.borderRadius || 8);
  const [fontFamily, setFontFamily] = useState(settings.fontFamily || "inherit");
  const [fontSize, setFontSize] = useState(settings.fontSize || 16);
  const [iconType, setIconType] = useState(settings.iconType || "CHEVRON");
  const [allowMultipleOpen, setAllowMultipleOpen] = useState(settings.allowMultipleOpen ?? false);
  const [openFirstByDefault, setOpenFirstByDefault] = useState(settings.openFirstByDefault ?? true);
  const [enableSearch, setEnableSearch] = useState(settings.enableSearch ?? true);
  const [enableCategoryIcons, setEnableCategoryIcons] = useState(settings.enableCategoryIcons ?? true);
  const [enableFeedback, setEnableFeedback] = useState(settings.enableFeedback ?? true);
  const [enableInquiryForm, setEnableInquiryForm] = useState(settings.enableInquiryForm ?? true);
  const [enableSchemaOrg, setEnableSchemaOrg] = useState(settings.enableSchemaOrg ?? true);
  const [customCss, setCustomCss] = useState(settings.customCss || "");

  // Preview interactive state
  const [openAccordionIdx, setOpenAccordionIdx] = useState<number | null>(openFirstByDefault ? 0 : null);

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Customizer settings saved successfully!");
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        faqTitle,
        faqSubtitle,
        layoutStyle,
        primaryColor,
        textColor,
        backgroundColor,
        accordionBgColor,
        borderColor,
        borderRadius: borderRadius.toString(),
        fontFamily,
        fontSize: fontSize.toString(),
        iconType,
        allowMultipleOpen: allowMultipleOpen.toString(),
        openFirstByDefault: openFirstByDefault.toString(),
        enableSearch: enableSearch.toString(),
        enableCategoryIcons: enableCategoryIcons.toString(),
        enableFeedback: enableFeedback.toString(),
        enableInquiryForm: enableInquiryForm.toString(),
        enableSchemaOrg: enableSchemaOrg.toString(),
        customCss,
      },
      { method: "POST" }
    );
  };

  const sampleFaqs = [
    {
      q: "How long does standard shipping take?",
      a: "Standard shipping typically takes 3-5 business days within the continental United States. International orders usually arrive in 7-14 business days with tracking.",
    },
    {
      q: "What is your 30-day return policy?",
      a: "We offer hassle-free returns within 30 days of receipt. All items must be unused, unwashed, and in original packaging with tags intact.",
    },
    {
      q: "How can I track my package in real-time?",
      a: "As soon as your order leaves our fulfillment center, you will receive an email containing your tracking number and a direct carrier tracking link.",
    },
  ];

  return (
    <s-page heading="Visual Customizer & Live Preview">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        {...(isLoading ? { loading: true } : {})}
      >
        Save Changes
      </s-button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column: Settings Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* General Headers */}
          <s-section heading="Titles & Headings">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontWeight: 600, fontSize: "14px" }}>Main Help Center Title</label>
              <input
                type="text"
                value={faqTitle}
                onChange={(e) => setFaqTitle(e.target.value)}
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

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
              <label style={{ fontWeight: 600, fontSize: "14px" }}>Subtitle / Intro Message</label>
              <textarea
                value={faqSubtitle}
                onChange={(e) => setFaqSubtitle(e.target.value)}
                rows={2}
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
          </s-section>

          {/* Colors & Typography */}
          <s-section heading="Colors & Theme Styling">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: "13px" }}>Primary / Accent Color</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    style={{ width: "36px", height: "36px", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid #c9cccf", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px" }}>Text Color</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    style={{ width: "36px", height: "36px", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid #c9cccf", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px" }}>Accordion Background</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                  <input
                    type="color"
                    value={accordionBgColor}
                    onChange={(e) => setAccordionBgColor(e.target.value)}
                    style={{ width: "36px", height: "36px", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={accordionBgColor}
                    onChange={(e) => setAccordionBgColor(e.target.value)}
                    style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid #c9cccf", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px" }}>Border Color</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    style={{ width: "36px", height: "36px", border: "none", borderRadius: "4px", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid #c9cccf", fontSize: "13px" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px" }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: "13px" }}>Border Radius ({borderRadius}px)</label>
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(parseInt(e.target.value, 10))}
                  style={{ width: "100%", marginTop: "8px" }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px" }}>Font Size ({fontSize}px)</label>
                <input
                  type="range"
                  min="13"
                  max="20"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  style={{ width: "100%", marginTop: "8px" }}
                />
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={{ fontWeight: 600, fontSize: "13px" }}>Accordion Expand Icon</label>
              <select
                value={iconType}
                onChange={(e) => setIconType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                  fontSize: "14px",
                  marginTop: "4px",
                  boxSizing: "border-box",
                }}
              >
                <option value="CHEVRON">Chevron (⌄ / ⌃)</option>
                <option value="PLUS_MINUS">Plus / Minus (+ / −)</option>
                <option value="ARROW">Arrow (→ / ↓)</option>
                <option value="CARET">Caret (▼ / ▲)</option>
              </select>
            </div>
          </s-section>

          {/* Interactive Feature Toggles */}
          <s-section heading="Interactive Features">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={enableSearch}
                  onChange={(e) => setEnableSearch(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Enable Instant Live Search Bar</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={enableFeedback}
                  onChange={(e) => setEnableFeedback(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Enable "Was this helpful?" Feedback Rating (👍 / 👎)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={enableInquiryForm}
                  onChange={(e) => setEnableInquiryForm(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Enable "Ask a Question" Contact Form Fallback</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={enableSchemaOrg}
                  onChange={(e) => setEnableSchemaOrg(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Enable Schema.org FAQPage JSON-LD (SEO Rich Snippets)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={openFirstByDefault}
                  onChange={(e) => setOpenFirstByDefault(e.target.checked)}
                />
                <span style={{ fontSize: "14px" }}>Open First FAQ Accordion by Default</span>
              </label>
            </div>
          </s-section>
        </div>

        {/* Right Column: Live Interactive Storefront Preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <s-section heading="Live Storefront Preview">
            <div
              style={{
                background: backgroundColor,
                color: textColor,
                padding: "24px",
                borderRadius: "12px",
                border: "1px solid #dcdfe3",
                boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                fontFamily: fontFamily === "inherit" ? "sans-serif" : fontFamily,
                minHeight: "540px",
              }}
            >
              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: `${fontSize + 6}px`, fontWeight: 700, margin: "0 0 8px", color: textColor }}>
                  {faqTitle}
                </h2>
                {faqSubtitle && (
                  <p style={{ fontSize: `${fontSize - 2}px`, color: "#6d7175", margin: 0 }}>
                    {faqSubtitle}
                  </p>
                )}
              </div>

              {/* Search Bar Preview */}
              {enableSearch && (
                <div style={{ marginBottom: "20px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "#f9fafb",
                      border: `1px solid ${borderColor}`,
                      borderRadius: `${borderRadius}px`,
                      padding: "10px 14px",
                      gap: "10px",
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>🔍</span>
                    <input
                      type="text"
                      placeholder="Search questions or keywords..."
                      readOnly
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        fontSize: `${fontSize - 1}px`,
                        color: textColor,
                        outline: "none",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Accordions Preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {sampleFaqs.map((faq, idx) => {
                  const isOpen = openAccordionIdx === idx;
                  return (
                    <div
                      key={idx}
                      style={{
                        background: accordionBgColor,
                        border: `1px solid ${isOpen ? primaryColor : borderColor}`,
                        borderRadius: `${borderRadius}px`,
                        overflow: "hidden",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenAccordionIdx(isOpen ? null : idx)}
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          color: textColor,
                          fontWeight: 600,
                          fontSize: `${fontSize}px`,
                        }}
                      >
                        <span>{faq.q}</span>
                        <span
                          style={{
                            color: primaryColor,
                            fontWeight: 700,
                            fontSize: "16px",
                            transform: isOpen && iconType === "CHEVRON" ? "rotate(180deg)" : "none",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          {iconType === "CHEVRON"
                            ? "⌄"
                            : iconType === "PLUS_MINUS"
                            ? isOpen
                              ? "−"
                              : "+"
                            : iconType === "ARROW"
                            ? isOpen
                              ? "↓"
                              : "→"
                            : isOpen
                            ? "▲"
                            : "▼"}
                        </span>
                      </button>

                      {isOpen && (
                        <div
                          style={{
                            padding: "0 16px 14px",
                            fontSize: `${fontSize - 1}px`,
                            lineHeight: 1.6,
                            color: "#4a4f54",
                            borderTop: `1px solid ${borderColor}`,
                            paddingTop: "12px",
                          }}
                        >
                          <p style={{ margin: 0 }}>{faq.a}</p>

                          {enableFeedback && (
                            <div
                              style={{
                                marginTop: "12px",
                                paddingTop: "10px",
                                borderTop: "1px dashed #e1e3e5",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontSize: "12px",
                              }}
                            >
                              <span style={{ color: "#6d7175" }}>Was this answer helpful?</span>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  style={{
                                    border: `1px solid ${borderColor}`,
                                    background: "#fff",
                                    padding: "3px 8px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                >
                                  👍 Yes
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    border: `1px solid ${borderColor}`,
                                    background: "#fff",
                                    padding: "3px 8px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                >
                                  👎 No
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Inquiry Fallback Preview */}
              {enableInquiryForm && (
                <div
                  style={{
                    marginTop: "24px",
                    padding: "16px",
                    background: "#f4f6f8",
                    borderRadius: `${borderRadius}px`,
                    textAlign: "center",
                  }}
                >
                  <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: "13px" }}>
                    Still have questions? We're here to help!
                  </p>
                  <button
                    type="button"
                    style={{
                      background: primaryColor,
                      color: "#ffffff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: `${borderRadius}px`,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    ✉️ Ask a Question
                  </button>
                </div>
              )}
            </div>
          </s-section>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
