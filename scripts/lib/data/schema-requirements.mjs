// Required / recommended properties per schema.org type (presence only, not value validation).
//
// Adapted from seomator-geo-audit `src/geo_audit/data/schema_requirements.json`
// Copyright (c) 2026 SEOmator — MIT License (full text in THIRD_PARTY_NOTICES.md).
// Changes: Organization requires url + logo (Google logo feature); WebSite requires url, SearchAction dropped (retired);
// Product needs one of offers/review/aggregateRating and does not recommend aggregateRating (only real, visible
// ratings); Article fields Google checks (headline, datePublished, author, image) stay in rule `article-fields`;
// WebApplication, Dataset, VideoObject per Google's docs; WebPage `speakable` dropped (little use).
// `anyOf` = at least one of the listed properties.

export const REQUIREMENTS = {
  Organization: { required: ["name", "url", "logo"], recommended: ["sameAs"] },
  LocalBusiness: { required: ["name", "address"], recommended: ["telephone", "openingHoursSpecification|openingHours", "url", "geo"] },
  Person: { required: ["name"], recommended: ["url", "sameAs"] },
  WebSite: { required: ["name", "url"], recommended: [] },
  Article: { required: [], recommended: ["dateModified", "publisher"] },
  BlogPosting: { required: [], recommended: ["dateModified", "publisher"] },
  NewsArticle: { required: [], recommended: ["dateModified", "publisher"] },
  Product: { required: ["name", "offers|review|aggregateRating"], recommended: ["image", "description", "brand"] },
  SoftwareApplication: { required: ["name"], recommended: ["applicationCategory", "operatingSystem", "offers"] },
  WebApplication: { required: ["name"], recommended: ["applicationCategory", "operatingSystem", "offers"] },
  Dataset: { required: ["name", "description"], recommended: ["creator"] },
  Event: { required: ["name", "startDate", "location"], recommended: ["endDate", "offers", "image"] },
  Recipe: { required: ["name", "image"], recommended: ["recipeIngredient", "recipeInstructions"] },
  VideoObject: { required: ["name", "thumbnailUrl", "uploadDate"], recommended: ["description"] },
  HowTo: { required: ["name", "step"], recommended: [] },
  FAQPage: { required: ["mainEntity"], recommended: [] },
  BreadcrumbList: { required: ["itemListElement"], recommended: [] },
};

/** Site-wide entities: judged once per @id (or name) across the whole crawl, nested copies included. */
export const ENTITY_TYPES = ["Organization", "LocalBusiness", "Person", "WebSite"];

export const ARTICLE_TYPES = ["Article", "BlogPosting", "NewsArticle", "TechArticle", "ScholarlyArticle", "Report"];

/** A page declaring one of these is a product, app, index, term or site page: never suggest Article markup for it. */
export const NOT_ARTICLE_TYPES = [
  "ItemPage", "DefinedTerm", "DefinedTermSet", "CollectionPage", "WebApplication", "SoftwareApplication", "MobileApplication",
  "Dataset", "AboutPage", "ContactPage", "FAQPage", "QAPage", "ProfilePage", "SearchResultsPage", "CheckoutPage",
  "Product", "ProductGroup", "Event", "Recipe", "HowTo", "LocalBusiness",
];
