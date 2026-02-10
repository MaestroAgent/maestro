# SEO Audit Checklist

## Tier 1: Crawlability & Indexation

### robots.txt
- [ ] robots.txt exists and is accessible at /robots.txt
- [ ] Not blocking important pages (check Disallow rules)
- [ ] Not blocking CSS/JS files needed for rendering
- [ ] Points to XML sitemap
- [ ] No accidental wildcard blocks

### XML Sitemap
- [ ] Sitemap exists and is submitted to GSC
- [ ] Only includes indexable pages (200 status, no noindex)
- [ ] Updated when new pages are published
- [ ] Under 50,000 URLs per sitemap (use sitemap index if larger)
- [ ] No redirect URLs in sitemap
- [ ] Lastmod dates are accurate (not all the same date)

### Canonical Tags
- [ ] Every page has a self-referencing canonical
- [ ] No conflicting canonicals (canonical pointing to a different page that canonicals back)
- [ ] HTTP pages canonical to HTTPS versions
- [ ] www and non-www consistent
- [ ] Paginated pages canonical correctly

### Redirects
- [ ] No redirect chains (A→B→C, should be A→C)
- [ ] No redirect loops
- [ ] Old URLs properly 301 to new URLs
- [ ] HTTP → HTTPS redirect in place
- [ ] www → non-www (or vice versa) redirect in place

### HTTP Status Codes
- [ ] No 404s on important pages (check GSC Coverage report)
- [ ] No 5xx errors
- [ ] Soft 404s identified and fixed (pages that return 200 but show error content)
- [ ] All important pages return 200

### Noindex / Nofollow
- [ ] No accidental noindex on important pages
- [ ] Thin/duplicate pages are noindexed
- [ ] Admin/staging pages are noindexed
- [ ] nofollow used sparingly and intentionally

## Tier 2: Technical Performance

### Core Web Vitals
- [ ] LCP (Largest Contentful Paint) < 2.5 seconds
- [ ] FID (First Input Delay) < 100ms / INP < 200ms
- [ ] CLS (Cumulative Layout Shift) < 0.1
- [ ] Check both mobile and desktop scores
- [ ] Test on real devices, not just Lighthouse

### Page Speed
- [ ] TTFB (Time to First Byte) < 200ms
- [ ] No render-blocking CSS/JS in head
- [ ] Images optimized (WebP, compressed, lazy-loaded)
- [ ] Critical CSS inlined
- [ ] Unused CSS/JS removed
- [ ] CDN in use for static assets
- [ ] Browser caching configured (cache headers)
- [ ] GZIP/Brotli compression enabled

### Mobile
- [ ] Responsive design (no horizontal scrolling)
- [ ] Touch targets adequately sized (48px minimum)
- [ ] Font size readable without zooming (16px minimum)
- [ ] No intrusive interstitials
- [ ] Viewport meta tag present

### HTTPS
- [ ] Full site on HTTPS
- [ ] No mixed content (HTTP resources on HTTPS pages)
- [ ] SSL certificate valid and not expiring soon
- [ ] HSTS header configured

### Structured Data
- [ ] JSON-LD format (preferred over microdata)
- [ ] Valid schema (test with Google Rich Results Test)
- [ ] Appropriate types: Article, Product, FAQ, HowTo, Organization, BreadcrumbList
- [ ] No warnings or errors in GSC Enhancement reports

### JavaScript Rendering
- [ ] Critical content visible without JavaScript (view source, not inspect)
- [ ] Server-side rendering or pre-rendering for important pages
- [ ] Google can render JavaScript content (check with URL Inspection tool)
- [ ] No content hidden behind click events that Googlebot can't trigger

## Tier 3: On-Page Optimization

### Title Tags
- [ ] Every page has a unique title
- [ ] Primary keyword included (front-loaded when possible)
- [ ] Under 60 characters (or ~580px width)
- [ ] Brand name format consistent (usually at end: "Title | Brand")
- [ ] No duplicate titles across the site
- [ ] Compelling for click-through (not just keyword-stuffed)

### Meta Descriptions
- [ ] Every important page has a unique meta description
- [ ] 150-160 characters
- [ ] Includes primary keyword naturally
- [ ] Contains a compelling reason to click
- [ ] No duplicates across the site

### Header Tags
- [ ] One H1 per page
- [ ] H1 includes primary keyword
- [ ] Logical hierarchy: H1 → H2 → H3 (no skipping levels)
- [ ] Subheadings are descriptive and keyword-relevant
- [ ] No H tags used purely for styling

### Internal Linking
- [ ] No orphan pages (every page reachable via internal links)
- [ ] Important pages have the most internal links
- [ ] Anchor text is descriptive (not "click here")
- [ ] Breadcrumb navigation on all pages
- [ ] Related content links in blog posts
- [ ] Silo structure: topic clusters linked to pillar pages

### Images
- [ ] All images have descriptive alt text
- [ ] Alt text includes keywords where natural
- [ ] Images compressed and appropriately sized
- [ ] WebP format used (with fallbacks)
- [ ] Lazy loading for below-the-fold images
- [ ] Descriptive file names (not IMG_001.jpg)

### URLs
- [ ] Clean, readable URL structure
- [ ] Short (under 75 characters)
- [ ] Lowercase only
- [ ] Hyphens between words (not underscores)
- [ ] No unnecessary parameters or session IDs
- [ ] Logical hierarchy (/category/subcategory/page)

## Tier 4: Content Quality

### Keyword Targeting
- [ ] Each page targets a unique primary keyword
- [ ] No keyword cannibalization (multiple pages targeting same term)
- [ ] Content matches search intent for target keywords
- [ ] Related keywords and semantic variations included naturally

### Content Depth
- [ ] No thin content pages (under 300 words with no unique value)
- [ ] Comprehensive coverage of topic (compare to top-ranking competitors)
- [ ] Original insights, data, or perspectives (not just rehashed info)
- [ ] Updated regularly (especially time-sensitive content)

### Duplicate Content
- [ ] No substantial duplicate content across pages
- [ ] Near-duplicates identified and consolidated
- [ ] Syndicated content uses canonical to original
- [ ] Parameter-based duplicates handled (canonical or robots.txt)

### E-E-A-T Signals
- [ ] Author information on content pages
- [ ] Author bio with credentials and expertise
- [ ] About page with company/personal credentials
- [ ] Citations and links to authoritative sources
- [ ] Contact information easily accessible
- [ ] Privacy policy and terms of service present

## Tier 5: Authority & Off-Page

### Backlink Profile
- [ ] Domain Rating/Authority assessed
- [ ] No toxic or spammy backlinks
- [ ] Disavow file for known toxic links
- [ ] Backlinks growing over time (not declining)
- [ ] Links from relevant, authoritative domains
- [ ] Anchor text distribution looks natural

### Brand Signals
- [ ] Unlinked brand mentions identified (opportunity to request links)
- [ ] Consistent NAP (Name, Address, Phone) if local business
- [ ] Active social profiles linked from site
- [ ] Google Business Profile claimed and optimized (if applicable)

### Topical Authority
- [ ] Core topics covered comprehensively (topic clusters)
- [ ] Supporting content for each pillar topic
- [ ] Internal linking reinforces topic relationships
- [ ] Consistent publishing in core topic areas
