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
  const { faqId, voteType, sessionId, shopParam } = body;

  shop = shop || url.searchParams.get("shop") || shopParam;

  if (!faqId || !voteType || !["HELPFUL", "UNHELPFUL"].includes(voteType)) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Find the FAQ item
  const faq = await prisma.faqItem.findUnique({
    where: { id: faqId },
  });

  if (!faq) {
    return Response.json({ error: "FAQ not found" }, { status: 404 });
  }

  const targetShop = shop || faq.shop;

  // Deduplication check: if this session already voted on this FAQ, return early
  if (sessionId) {
    const existingVote = await prisma.faqVote.findFirst({
      where: {
        shop: targetShop,
        faqId,
        sessionId,
      },
    });

    if (existingVote) {
      return Response.json(
        { success: true, duplicate: true },
        {
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }

  // Record vote
  await prisma.faqVote.create({
    data: {
      shop: targetShop,
      faqId,
      voteType: voteType as "HELPFUL" | "UNHELPFUL",
      sessionId: sessionId || null,
    },
  });

  // Increment counter on FaqItem
  if (voteType === "HELPFUL") {
    await prisma.faqItem.update({
      where: { id: faqId },
      data: { helpfulCount: { increment: 1 } },
    });
  } else {
    await prisma.faqItem.update({
      where: { id: faqId },
      data: { unhelpfulCount: { increment: 1 } },
    });
  }

  return Response.json(
    { success: true },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};
