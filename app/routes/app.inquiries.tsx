import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { sendInquiryResolutionEmail } from "../utils/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const inquiries = await prisma.customerInquiry.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  const totalInquiries = inquiries.length;
  const newInquiries = inquiries.filter((i) => i.status === "NEW").length;
  const inReviewInquiries = inquiries.filter((i) => i.status === "IN_REVIEW").length;
  const resolvedInquiries = inquiries.filter((i) => i.status === "RESOLVED").length;

  return {
    shop,
    inquiries,
    stats: {
      totalInquiries,
      newInquiries,
      inReviewInquiries,
      resolvedInquiries,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "UPDATE_STATUS") {
    const id = formData.get("id") as string;
    const status = formData.get("status") as any;
    const adminNote = (formData.get("adminNote") as string) || null;

    if (!id || !status) return { success: false, error: "Missing fields" };

    await prisma.customerInquiry.updateMany({
      where: { id, shop },
      data: {
        status,
        ...(adminNote !== null ? { adminNote } : {}),
      },
    });

    return { success: true, action: "UPDATED", message: "Inquiry status updated" };
  }

  if (intent === "REPLY_AND_RESOLVE") {
    const id = formData.get("id") as string;
    const replyMessage = (formData.get("replyMessage") as string) || "";
    const sendEmail = formData.get("sendEmail") === "true";

    if (!id) return { success: false, error: "Missing inquiry ID" };

    const inquiry = await prisma.customerInquiry.findFirst({
      where: { id, shop },
    });

    if (!inquiry) return { success: false, error: "Inquiry not found" };

    // Update status to RESOLVED and store the reply message in adminNote immediately
    const timestamp = new Date().toLocaleString();
    const updatedNote = replyMessage.trim()
      ? `[REPLIED ${timestamp}]:\n${replyMessage.trim()}`
      : inquiry.adminNote;

    await prisma.customerInquiry.updateMany({
      where: { id, shop },
      data: {
        status: "RESOLVED",
        adminNote: updatedNote,
      },
    });

    // Dispatch email asynchronously so merchant does not experience loading lag
    if (sendEmail && inquiry.customerEmail) {
      sendInquiryResolutionEmail({
        to: inquiry.customerEmail,
        customerName: inquiry.customerName,
        subject: inquiry.subject,
        customerQuestion: inquiry.message,
        replyMessage: replyMessage.trim() || "Your question has been resolved by our support team.",
        shop,
      }).catch((err) => {
        console.error("Background email sending error:", err);
      });
    }

    return {
      success: true,
      action: "REPLY_RESOLVED",
      message: sendEmail
        ? "✅ Email sent to customer & inquiry marked resolved!"
        : "✅ Inquiry marked resolved!",
    };
  }

  if (intent === "DELETE") {
    const id = formData.get("id") as string;
    if (!id) return { success: false, error: "ID is required" };

    await prisma.customerInquiry.deleteMany({
      where: { id, shop },
    });

    return { success: true, action: "DELETED", message: "Inquiry deleted" };
  }

  return { success: false, error: "Invalid intent" };
};

export default function InquiriesRoute() {
  const { shop, inquiries, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL");
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [replyModalInquiry, setReplyModalInquiry] = useState<any | null>(null);

  const [adminNote, setAdminNote] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [sendEmailToggle, setSendEmailToggle] = useState(true);

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Changes saved successfully");
      setSelectedInquiry(null);
      setReplyModalInquiry(null);
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleOpenReplyModal = (inq: any) => {
    setReplyModalInquiry(inq);
    const greeting = inq.customerName?.trim() ? inq.customerName.trim() : "there";
    setReplyMessage(
      `Hi ${greeting},\n\nThank you for contacting us! Regarding your question:\n\n"${inq.message}"\n\nWe would like to let you know that: \n\nPlease let us know if you need any further assistance.\n\nBest regards,\nSupport Team`
    );
    setSendEmailToggle(true);
  };

  const handleSendReplyAndResolve = () => {
    if (!replyModalInquiry) return;
    fetcher.submit(
      {
        intent: "REPLY_AND_RESOLVE",
        id: replyModalInquiry.id,
        replyMessage,
        sendEmail: sendEmailToggle ? "true" : "false",
      },
      { method: "POST" }
    );
  };

  const handleUpdateStatus = (id: string, newStatus: string) => {
    fetcher.submit(
      { intent: "UPDATE_STATUS", id, status: newStatus },
      { method: "POST" }
    );
  };

  const handleSaveNote = () => {
    if (!selectedInquiry) return;
    fetcher.submit(
      {
        intent: "UPDATE_STATUS",
        id: selectedInquiry.id,
        status: selectedInquiry.status,
        adminNote,
      },
      { method: "POST" }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this customer inquiry?")) {
      fetcher.submit({ intent: "DELETE", id }, { method: "POST" });
    }
  };

  const filteredInquiries = inquiries.filter((inq) => {
    if (selectedStatusFilter === "ALL") return true;
    return inq.status === selectedStatusFilter;
  });

  return (
    <s-page heading="Customer Inquiries & Email Replies">
      {/* Stats Cards */}
      <s-section heading="Overview">
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Total Inquiries</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px" }}>{stats.totalInquiries}</div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>New / Unresolved</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px", color: stats.newInquiries > 0 ? "#b91c1c" : "#202223" }}>
              {stats.newInquiries}
            </div>
          </div>

          <div style={{ padding: "16px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", minWidth: "150px" }}>
            <div style={{ color: "#6d7175", fontSize: "13px" }}>Resolved</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px", color: "#15803d" }}>{stats.resolvedInquiries}</div>
          </div>
        </div>
      </s-section>

      {/* Inquiries Table & Filter */}
      <s-section heading="Questions Submitted by Customers">
        <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              fontSize: "14px",
              minWidth: "160px",
            }}
          >
            <option value="ALL">All Inquiries ({inquiries.length})</option>
            <option value="NEW">🆕 New ({stats.newInquiries})</option>
            <option value="IN_REVIEW">👀 In Review ({stats.inReviewInquiries})</option>
            <option value="RESOLVED">✅ Resolved ({stats.resolvedInquiries})</option>
            <option value="SPAM">🚫 Spam</option>
          </select>

          <span style={{ fontSize: "13px", color: "#6d7175" }}>
            💡 Tip: Click <strong>"Reply & Resolve"</strong> to email your answer directly to the customer.
          </span>
        </div>

        {filteredInquiries.length === 0 ? (
          <div style={{ padding: "32px", background: "#f6f6f7", borderRadius: "8px", border: "1px solid #e1e3e5", textAlign: "center" }}>
            <s-heading>No Inquiries Found</s-heading>
            <p style={{ color: "#6d7175", margin: "12px 0 0" }}>
              When shoppers have a question not answered in your FAQs, they can submit it via the "Ask a Question" fallback form.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {filteredInquiries.map((inq) => (
              <div
                key={inq.id}
                style={{
                  padding: "18px",
                  borderRadius: "8px",
                  border: inq.status === "NEW" ? "1px solid #008060" : "1px solid #e1e3e5",
                  background: inq.status === "NEW" ? "#ffffff" : "#fbfbfb",
                  boxShadow: inq.status === "NEW" ? "0 2px 8px rgba(0, 128, 96, 0.08)" : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "280px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                    <s-badge
                      tone={
                        inq.status === "NEW"
                          ? "caution"
                          : inq.status === "RESOLVED"
                          ? "success"
                          : inq.status === "IN_REVIEW"
                          ? "info"
                          : "critical"
                      }
                    >
                      {inq.status}
                    </s-badge>

                    <span style={{ fontSize: "12px", color: "#6d7175" }}>
                      Submitted {new Date(inq.createdAt).toLocaleDateString()} at {new Date(inq.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {inq.pageUrl && (
                      <span style={{ fontSize: "12px", color: "#6d7175" }}>
                        Page: <code>{inq.pageUrl}</code>
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>
                    {inq.subject || "Customer Question"}
                  </h3>
                  <p style={{ margin: 0, color: "#202223", fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap", background: "#f8f9fa", padding: "10px 14px", borderRadius: "6px" }}>
                    {inq.message}
                  </p>

                  <div style={{ marginTop: "10px", fontSize: "13px", color: "#4a4f54", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                    <span>
                      👤 <strong>{inq.customerName || "Anonymous"}</strong> (<a href={`mailto:${inq.customerEmail}`} style={{ color: "#008060" }}>{inq.customerEmail}</a>)
                    </span>
                  </div>

                  {inq.adminNote && (
                    <div style={{ marginTop: "10px", padding: "10px 14px", background: inq.adminNote.includes("[REPLY SENT]") ? "#f0fdf4" : "#f1f2f4", borderLeft: inq.adminNote.includes("[REPLY SENT]") ? "3px solid #16a34a" : "3px solid #6d7175", borderRadius: "4px", fontSize: "13px", whiteSpace: "pre-wrap" }}>
                      <strong>{inq.adminNote.includes("[REPLY SENT]") ? "✉️ Reply History:" : "📝 Admin Note:"}</strong>
                      <div style={{ marginTop: "4px" }}>{inq.adminNote}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <s-button
                    variant="primary"
                    onClick={() => handleOpenReplyModal(inq)}
                  >
                    ✉️ Reply & Resolve
                  </s-button>

                  <s-button
                    variant="secondary"
                    onClick={() => {
                      setSelectedInquiry(inq);
                      setAdminNote(inq.adminNote || "");
                    }}
                  >
                    Note & Status
                  </s-button>

                  {inq.status !== "RESOLVED" ? (
                    <s-button
                      variant="tertiary"
                      onClick={() => handleUpdateStatus(inq.id, "RESOLVED")}
                      {...(isLoading ? { loading: true } : {})}
                    >
                      Quick Resolve
                    </s-button>
                  ) : (
                    <s-button
                      variant="tertiary"
                      onClick={() => handleUpdateStatus(inq.id, "NEW")}
                      {...(isLoading ? { loading: true } : {})}
                    >
                      Reopen
                    </s-button>
                  )}

                  <s-button
                    variant="tertiary"
                    tone="critical"
                    onClick={() => handleDelete(inq.id)}
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

      {/* Reply & Resolve Email Modal */}
      {replyModalInquiry && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "600px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>✉️ Reply & Resolve Customer Inquiry</h3>
              <button
                onClick={() => setReplyModalInquiry(null)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#6d7175" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: "#f6f6f7", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                <div><strong>To:</strong> {replyModalInquiry.customerName || "Customer"} &lt;{replyModalInquiry.customerEmail}&gt;</div>
                <div style={{ marginTop: "4px" }}><strong>Question:</strong> "{replyModalInquiry.message}"</div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "6px" }}>
                  Your Response Message (will be sent in the email body):
                </label>
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={8}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                    boxSizing: "border-box",
                  }}
                  placeholder="Type your answer to the customer here..."
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f0fdf4", padding: "10px 14px", borderRadius: "6px" }}>
                <input
                  type="checkbox"
                  id="sendEmailCheck"
                  checked={sendEmailToggle}
                  onChange={(e) => setSendEmailToggle(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="sendEmailCheck" style={{ fontSize: "13px", fontWeight: 500, color: "#166534", cursor: "pointer" }}>
                  Send official resolution email to <strong>{replyModalInquiry.customerEmail}</strong>
                </label>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", marginTop: "12px", flexWrap: "wrap" }}>
                <a
                  href={`mailto:${replyModalInquiry.customerEmail}?subject=${encodeURIComponent(`Re: Your Question - ${shop}`)}&body=${encodeURIComponent(replyMessage)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: "13px", color: "#008060", textDecoration: "underline" }}
                >
                  ↗️ Open in your Desktop/Gmail App
                </a>

                <div style={{ display: "flex", gap: "8px" }}>
                  <s-button onClick={() => setReplyModalInquiry(null)}>Cancel</s-button>
                  <s-button
                    variant="primary"
                    onClick={handleSendReplyAndResolve}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    🚀 {sendEmailToggle ? "Send Email & Resolve" : "Mark Resolved"}
                  </s-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note & Status Modal */}
      {selectedInquiry && (
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
            padding: "16px",
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
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}>Inquiry Details & Internal Notes</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <p style={{ margin: 0, fontSize: "14px" }}>
                <strong>From:</strong> {selectedInquiry.customerName || "Anonymous"} (
                <a href={`mailto:${selectedInquiry.customerEmail}`}>{selectedInquiry.customerEmail}</a>)
              </p>

              <div style={{ padding: "12px", background: "#f6f6f7", borderRadius: "6px", fontSize: "13px", whiteSpace: "pre-wrap" }}>
                {selectedInquiry.message}
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Status
                </label>
                <select
                  value={selectedInquiry.status}
                  onChange={(e) =>
                    setSelectedInquiry({ ...selectedInquiry, status: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="NEW">NEW</option>
                  <option value="IN_REVIEW">IN_REVIEW</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="SPAM">SPAM</option>
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "13px", display: "block", marginBottom: "4px" }}>
                  Internal Admin Note
                </label>
                <textarea
                  placeholder="Internal notes for your team regarding this customer query..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={4}
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

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                <s-button onClick={() => setSelectedInquiry(null)}>Cancel</s-button>
                <s-button variant="primary" onClick={handleSaveNote} {...(isLoading ? { loading: true } : {})}>
                  Save Changes
                </s-button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guide */}
      <s-section slot="aside" heading="Email & FAQ Tips">
        <s-paragraph>
          <strong>Automatic Email Dispatch:</strong> When you click <em>Reply & Resolve</em>, an email with your answer will be sent directly to the customer's email address.
        </s-paragraph>
        <div style={{ marginTop: "12px", fontSize: "13px", color: "#6d7175", lineHeight: 1.5 }}>
          <strong>SMTP Configuration:</strong> To send emails from your own domain / Gmail / Brevo, add your <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> in your app <code>.env</code> file.
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

