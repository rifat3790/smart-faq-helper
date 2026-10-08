import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shop: string | undefined;

  const url = new URL(request.url);

  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (err) {
    // App proxy signature fallback
  }

  const query = url.searchParams.get("q")?.trim() || "";
  shop = shop || url.searchParams.get("shop") || undefined;

  if (!shop) {
    const activeSetting = await prisma.shopSetting.findFirst();
    shop = activeSetting?.shop || (await prisma.session.findFirst())?.shop || "smart-faq-helper.myshopify.com";
  }

  if (!query) {
    return Response.json({ results: [] });
  }

  // Find matching published FAQs
  const matchingFaqs = await prisma.faqItem.findMany({
    where: {
      shop,
      isPublished: true,
      OR: [
        { question: { contains: query, mode: "insensitive" } },
        { answer: { contains: query, mode: "insensitive" } },
        { tags: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { category: true },
    take: 20,
  });

  // Track search query and zero-result count asynchronously for analytics
  try {
    await prisma.searchLog.create({
      data: {
        shop,
        query,
        resultsCount: matchingFaqs.length,
        hasZeroResults: matchingFaqs.length === 0,
      },
    });
  } catch (e) {
    console.error("Search log logging error:", e);
  }

  return Response.json(
    {
      query,
      count: matchingFaqs.length,
      results: matchingFaqs,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};
