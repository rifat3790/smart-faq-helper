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

  shop = shop || url.searchParams.get("shop") || undefined;

  if (!shop) {
    const activeSetting = await prisma.shopSetting.findFirst();
    shop = activeSetting?.shop || (await prisma.session.findFirst())?.shop || "smart-faq-helper.myshopify.com";
  }

  const [categories, faqs, settings] = await Promise.all([
    prisma.faqCategory.findMany({
      where: { shop, isPublished: true },
      orderBy: { sortOrder: "asc" },
      include: {
        faqs: {
          where: { isPublished: true },
          orderBy: [
            { isPinned: "desc" },
            { sortOrder: "asc" },
            { createdAt: "desc" },
          ],
        },
      },
    }),
    prisma.faqItem.findMany({
      where: { shop, isPublished: true },
      orderBy: [
        { isPinned: "desc" },
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        productTargets: true,
      },
    }),
    prisma.shopSetting.findUnique({
      where: { shop },
    }),
  ]);

  return Response.json(
    {
      categories,
      faqs,
      settings: settings || {
        faqTitle: "Frequently Asked Questions",
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
        enableSearch: true,
        enableFeedback: true,
        enableInquiryForm: true,
        enableSchemaOrg: true,
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
};
