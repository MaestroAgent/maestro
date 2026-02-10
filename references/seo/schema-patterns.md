# Schema Markup Patterns

## When to Use Structured Data

Structured data (JSON-LD) helps search engines understand page content and can trigger rich results in SERPs. Use it on every page where applicable.

**Always use JSON-LD format** (Google's recommended format, easier to maintain than microdata).

## Essential Schema Types

### Organization
Use on: Homepage

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Company Name",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png",
  "description": "Brief company description",
  "foundingDate": "2020",
  "sameAs": [
    "https://twitter.com/company",
    "https://linkedin.com/company/company",
    "https://youtube.com/@company"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "email": "support@example.com"
  }
}
```

### WebSite + SearchAction
Use on: Homepage (enables sitelinks search box)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Site Name",
  "url": "https://example.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://example.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

### Article / BlogPosting
Use on: Blog posts, articles, news

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Article Title (max 110 chars)",
  "description": "Brief description",
  "image": "https://example.com/image.jpg",
  "author": {
    "@type": "Person",
    "name": "Author Name",
    "url": "https://example.com/about/author"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Company Name",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  },
  "datePublished": "2026-01-15",
  "dateModified": "2026-02-01"
}
```

### BreadcrumbList
Use on: All pages with breadcrumb navigation

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://example.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Blog",
      "item": "https://example.com/blog"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Article Title"
    }
  ]
}
```

### FAQPage
Use on: FAQ sections, pages with Q&A content

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is [topic]?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text here. Can include <a href='url'>links</a>."
      }
    },
    {
      "@type": "Question",
      "name": "How does [feature] work?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text here."
      }
    }
  ]
}
```

### HowTo
Use on: Tutorial and how-to content

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to [do something]",
  "description": "Brief description of the process",
  "totalTime": "PT30M",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Step 1 title",
      "text": "Step 1 description",
      "image": "https://example.com/step1.jpg"
    },
    {
      "@type": "HowToStep",
      "name": "Step 2 title",
      "text": "Step 2 description"
    }
  ]
}
```

### Product
Use on: Product pages, pricing pages

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "description": "Product description",
  "image": "https://example.com/product.jpg",
  "brand": {
    "@type": "Brand",
    "name": "Brand Name"
  },
  "offers": {
    "@type": "Offer",
    "price": "49.00",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "url": "https://example.com/pricing"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "250"
  }
}
```

### SoftwareApplication
Use on: SaaS product pages

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "App Name",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "150"
  }
}
```

### VideoObject
Use on: Pages with embedded videos

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Video Title",
  "description": "Video description",
  "thumbnailUrl": "https://example.com/thumbnail.jpg",
  "uploadDate": "2026-01-15",
  "duration": "PT10M30S",
  "contentUrl": "https://example.com/video.mp4",
  "embedUrl": "https://youtube.com/embed/xxxxx"
}
```

## Schema for Programmatic SEO

### Location Pages
Combine `LocalBusiness` + `Service` + `FAQPage`:
- LocalBusiness with address for the specific location
- Service describing what you offer there
- FAQ with location-specific questions

### Comparison Pages
Use `WebPage` with:
- `about` pointing to both products being compared
- `FAQPage` for comparison questions

### Glossary Pages
Use `DefinedTerm`:
```json
{
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  "name": "Term Name",
  "description": "Definition of the term"
}
```

## Validation

### Tools
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org
- Google Search Console: Enhancements report

### Common Errors
- Missing required fields for the schema type
- Mismatch between schema data and visible page content
- Broken image URLs in schema
- Invalid date formats (use ISO 8601: YYYY-MM-DD)
- Schema data that contradicts page content (Google may penalize)

### Best Practices
- Only mark up content that's visible on the page
- Keep schema data accurate and up-to-date
- Don't use schema to mark up content that's hidden from users
- One primary schema type per page (can combine with BreadcrumbList)
- Test after deployment and monitor GSC for errors
