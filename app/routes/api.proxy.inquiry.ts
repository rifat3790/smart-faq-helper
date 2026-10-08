import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string | undefined;

  const url = new URL(request.url);

  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (err) {
    // App proxy signature may fail in dev previews
  }

  const body = await request.json().catch(() => ({}));
  const { customerName, customerEmail, subject, message, pageUrl, shopParam } = body;

  shop = shop || url.searchParams.get("shop") || shopParam;

  if (!shop) {
    const activeSetting = await prisma.shopSetting.findFirst();
    shop = activeSetting?.shop || (await prisma.session.findFirst())?.shop || "smart-faq-helper.myshopify.com";
  }

  if (!customerEmail || !message) {
    return Response.json({ error: "Missing required fields (email and message)" }, { status: 400 });
  }

  const trimmedEmail = customerEmail.trim();
  const trimmedMessage = message.trim();

  // Deduplication check: prevent identical submissions within 30 seconds
  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
  const existingInquiry = await prisma.customerInquiry.findFirst({
    where: {
      shop,
      customerEmail: trimmedEmail,
      message: trimmedMessage,
      createdAt: { gte: thirtySecondsAgo },
    },
  });

  if (existingInquiry) {
    return Response.json(
      { success: true, id: existingInquiry.id, duplicate: true },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  const inquiry = await prisma.customerInquiry.create({
    data: {
      shop,
      customerName: customerName ? customerName.trim() : null,
      customerEmail: trimmedEmail,
      subject: subject ? subject.trim() : null,
      message: trimmedMessage,
      pageUrl: pageUrl || null,
      status: "NEW",
    },
  });

  return Response.json(
    { success: true, id: inquiry.id },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};
