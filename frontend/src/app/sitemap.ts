import type { MetadataRoute } from "next";

const siteUrl = "https://contextsop.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/dashboard`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];
}
