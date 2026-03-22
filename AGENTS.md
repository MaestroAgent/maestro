# Maestro Agent Roster

37 specialized RevOps agents organized into 9 categories — 5 sales agents and 32 marketing agents. Each agent is an expert in its domain with deep frameworks, discovery questions, and structured output formats.

## How Agents Work

- **Orchestrator routes automatically**: Describe what you need and the orchestrator sends you to the right specialist.
- **Direct access**: If you know which agent you need, talk to it directly.
- **Lateral delegation**: Any agent can consult any other agent via `delegate_to_agent`.
- **Reference docs**: Agents load deep reference materials on demand for comprehensive context.

## Agent YAML Structure

```yaml
name: agent-name
category: category-name
description: >
  What the agent does.
  Trigger: "phrase 1", "phrase 2", "phrase 3"

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.4
  max_tokens: 8192

system_prompt: |
  Deep specialized prompt with frameworks, methodologies, output formats.

references:              # Loaded on demand into context
  - category/doc-name.md

tools:                   # Available tool integrations
  - calculator
  - delegate_to_agent

related_agents:          # Cross-referencing for lateral delegation
  - other-agent-name

max_tool_level: medium
```

---

## Sales (5 agents)

### pipeline-manager
Pipeline health, deal progression, revenue forecasting, and stalled deal identification.

**Triggers:** "pipeline review", "deal pipeline", "revenue forecast", "stalled deals", "pipeline health"

**Frameworks:** Pipeline Health Scorecard, Deal Velocity, Pipeline Coverage Ratio (3x rule), At-Risk Deal Identification

**Tools:** crm_deals, crm_pipeline, crm_activities, calculator

**Related agents:** deal-coach, lead-qualifier, prospector, analytics-interpreter

### lead-qualifier
Lead scoring, qualification assessment, and routing based on ICP fit and buying signals.

**Triggers:** "qualify this lead", "lead scoring", "is this a good lead", "ICP fit"

**Frameworks:** BANT Assessment (scored 1-5), ICP Fit Matrix (scored 0-2), Lead Source Quality, Qualification-to-Routing

**Tools:** crm_contacts, crm_companies, crm_deals, crm_activities

**Related agents:** prospector, pipeline-manager, deal-coach, email-sequence

### deal-coach
Deal strategy, objection handling, and next-step coaching for specific deals.

**Triggers:** "help with this deal", "deal strategy", "objection handling", "how to close", "deal stuck"

**Frameworks:** MEDDIC Deal Assessment, Objection Handling (LAER), Stakeholder Mapping, Stage-Specific Playbooks

**Tools:** crm_deals, crm_contacts, crm_companies, crm_activities

**Related agents:** pipeline-manager, meeting-prep, lead-qualifier

### meeting-prep
Pre-meeting research briefs compiling contact history, company context, deal status, and talking points.

**Triggers:** "meeting prep", "prepare for call", "pre-call research", "brief me on", "I have a meeting with"

**Frameworks:** Meeting Type Playbooks (discovery/demo/proposal/negotiation/check-in), Activity History Analysis

**Tools:** crm_contacts, crm_companies, crm_deals, crm_activities

**Related agents:** deal-coach, lead-qualifier, prospector

### prospector
Outbound prospecting strategy, target account identification, and outreach sequence design.

**Triggers:** "prospecting", "outbound strategy", "find leads", "target accounts", "cold outreach"

**Frameworks:** Target Account Selection, Multi-Touch Outreach Sequence (14-day), Personalization Tiers, First-Touch Email Angles

**Tools:** crm_companies, crm_contacts, crm_deals, crm_activities

**Related agents:** lead-qualifier, meeting-prep, email-sequence, linkedin-content

---

## Content & Copy (6 agents)

### blog-writer
Long-form posts, articles, and thought leadership content with SEO integration.

**Triggers:** "write a blog post", "article", "long-form content", "thought leadership piece"

**Frameworks:** Problem-Solution, Listicle, Ultimate Guide, Data-Driven, Narrative

**Related agents:** seo-auditor, keyword-researcher, newsletter-writer

### email-sequence
Automated email flows — welcome, nurture, sales, re-engagement, and onboarding sequences.

**Triggers:** "email sequence", "drip campaign", "welcome series", "nurture flow"

**Frameworks:** Welcome (7 emails), Nurture, Sales, Launch, Re-engagement, Onboarding

**Related agents:** sequence-builder, landing-page, segmentation

### landing-page
High-converting landing page copy with hero sections, features, social proof, and CTAs.

**Triggers:** "landing page", "sales page", "conversion copy", "page copy"

**Frameworks:** 7-Dimension CRO Analysis, Above-the-fold hierarchy, Section-by-section copywriting

**Related agents:** page-optimizer, signup-flow, social-content

### social-content
Platform-native social posts adapted for each platform's format and culture.

**Triggers:** "social media post", "social content", "Instagram caption", "social copy"

**Frameworks:** Platform-specific formats, Hook formulas, Engagement optimization

**Related agents:** linkedin-content, twitter-content, video-script

### video-script
YouTube scripts, ad scripts, and explainer videos with retention optimization.

**Triggers:** "video script", "YouTube script", "ad script", "explainer video"

**Frameworks:** Hook-Body-CTA, Pattern interrupts, Open loops, Retention techniques

**Related agents:** youtube-optimizer, blog-writer, social-content

### newsletter-writer
Newsletter content with engagement optimization, subject lines, and email-native formatting.

**Triggers:** "newsletter", "weekly email", "subscriber update", "Substack post"

**Frameworks:** Personal Letter, Curated Digest, Deep Dive, Hybrid

**Related agents:** email-sequence, blog-writer, social-content

---

## SEO & Discovery (4 agents)

### seo-auditor
Technical and on-page SEO analysis with 5-tier priority audit framework.

**Triggers:** "SEO audit", "why isn't my page ranking", "site health check", "technical SEO"

**Frameworks:** 5-Tier Audit (Crawlability → Technical → On-Page → Content → Authority), Scoring 1-5

**Tools:** google_search_console, web_fetch

**Related agents:** keyword-researcher, programmatic-seo, competitor-analyzer

### keyword-researcher
Keyword opportunity identification, clustering by intent, and content mapping.

**Triggers:** "keyword research", "what should I rank for", "search opportunities"

**Frameworks:** Intent Classification (Info/Nav/Commercial/Transactional), ICE Prioritization, Clustering

**Tools:** google_search_console

**Related agents:** seo-auditor, blog-writer, programmatic-seo

### programmatic-seo
Template-based page generation at scale — location pages, comparisons, integrations, glossaries.

**Triggers:** "programmatic SEO", "template pages", "pages at scale", "location pages"

**Frameworks:** 8 Playbooks (Location, Integration, Comparison, Template, Glossary, Tool, Industry, Role)

**Related agents:** seo-auditor, keyword-researcher, blog-writer

### competitor-analyzer
Competitive SEO positioning, content gaps, backlink opportunities, and comparison page strategy.

**Triggers:** "competitor analysis", "competitive SEO", "content gaps", "comparison pages"

**Frameworks:** Competitor Tiering, Content Gap Analysis, 4 Comparison Page Formats, Backlink Opportunities

**Tools:** google_search_console, web_fetch

**Related agents:** seo-auditor, keyword-researcher, marketing-strategist

---

## CRO & Conversion (4 agents)

### page-optimizer
Conversion rate optimization for any page type using 7-dimension analysis.

**Triggers:** "optimize this page", "improve conversions", "CRO audit", "why isn't this page converting"

**Frameworks:** 7-Dimension CRO (Clarity, Relevance, Motivation, Trust, Friction, Anxiety, Distraction), PIE Prioritization

**Tools:** web_fetch

**Related agents:** landing-page, signup-flow, pricing-strategist

### signup-flow
Registration and trial flow optimization to reduce drop-off and improve activation.

**Triggers:** "signup flow", "registration optimization", "trial conversion"

**Frameworks:** Progressive Disclosure, Friction Hierarchy, Flow Architecture, Common Conversion Killers

**Tools:** web_fetch

**Related agents:** page-optimizer, onboarding, landing-page

### onboarding
Post-signup activation and retention — getting users to their "aha moment" quickly.

**Triggers:** "onboarding flow", "user activation", "first-time experience", "reduce early churn"

**Frameworks:** 4-Phase Onboarding, Onboarding Patterns, Email Onboarding Sequence, Activation Metrics

**Related agents:** signup-flow, email-sequence, page-optimizer

### pricing-strategist
Pricing, packaging, and monetization analysis. Pricing page optimization and revenue growth.

**Triggers:** "pricing strategy", "pricing page", "plan structure", "should I raise prices"

**Frameworks:** 6 Pricing Models, Good/Better/Best, Pricing Psychology, Revenue Levers

**Tools:** web_fetch

**Related agents:** page-optimizer, analytics-interpreter, marketing-strategist

---

## Paid & Distribution (4 agents)

### campaign-builder
Ad campaign structure and strategy for Google, Meta, LinkedIn, and TikTok.

**Triggers:** "ad campaign", "Google Ads", "Meta ads", "paid advertising"

**Frameworks:** Platform-specific architectures, Budget allocation, Naming conventions, Measurement plans

**Related agents:** creative-tester, audience-targeter, budget-optimizer

### creative-tester
Ad creative and copy testing — test matrices, ad variations, and performance analysis.

**Triggers:** "ad creative", "ad copy", "test ad variations", "creative testing"

**Frameworks:** Test Hierarchy (Concept → Format → Hook → Visual → Copy → CTA), 6 Ad Copy Angles

**Related agents:** campaign-builder, landing-page, social-content

### audience-targeter
Audience segmentation and targeting across ad platforms.

**Triggers:** "audience targeting", "custom audiences", "lookalike audiences"

**Frameworks:** Funnel-Based Targeting, Platform-specific audience types, Layering approach, Exclusion strategy

**Related agents:** campaign-builder, budget-optimizer, analytics-interpreter

### budget-optimizer
Ad spend allocation and ROAS optimization across platforms and campaigns.

**Triggers:** "ad budget", "ROAS", "optimize spend", "budget allocation", "reduce CPA"

**Frameworks:** Allocation Matrix, Scaling Rules, Efficiency Frontier, Optimization Cadence

**Tools:** google_analytics

**Related agents:** campaign-builder, audience-targeter, analytics-interpreter

---

## Social & Community (4 agents)

### reddit-strategist
Reddit engagement, community building, and launch strategies.

**Triggers:** "Reddit strategy", "Reddit marketing", "subreddit", "Reddit launch"

**Frameworks:** 90/10 Rule, Authority Building Playbook, Product Launch Playbook, Subreddit Analysis

**Tools:** web_fetch

**Related agents:** social-content, marketing-strategist, free-tool-strategy

### youtube-optimizer
YouTube channel and video optimization — titles, thumbnails, descriptions, retention.

**Triggers:** "YouTube optimization", "video SEO", "YouTube growth", "improve thumbnails"

**Frameworks:** Title Formulas, Thumbnail Principles, Retention Optimization (Hook/Middle/End), Tags & Metadata

**Tools:** web_fetch

**Related agents:** video-script, keyword-researcher, social-content

### linkedin-content
LinkedIn posts, articles, and engagement strategy optimized for the algorithm.

**Triggers:** "LinkedIn post", "LinkedIn content", "LinkedIn strategy"

**Frameworks:** 4 Post Formats (Text/Carousel/Poll/Article), Hook Formulas, Algorithm Signals, Content Pillars

**Related agents:** social-content, newsletter-writer, blog-writer

### twitter-content
Twitter/X posts, threads, and growth tactics.

**Triggers:** "Twitter post", "tweet", "Twitter thread", "X strategy"

**Frameworks:** Tweet Formats (Single/Thread/Quote), Hook Formulas, Thread Structures, Growth Plays

**Related agents:** social-content, linkedin-content, blog-writer

---

## Email Marketing (3 agents)

### sequence-builder
Multi-email automation flows with timing, conditional logic, and behavioral triggers.

**Triggers:** "email sequence", "automation flow", "drip campaign", "welcome sequence"

**Frameworks:** Welcome/Sales/Re-engagement architectures, Conditional Logic, Tag-Based Routing

**Related agents:** email-sequence, deliverability, segmentation

### deliverability
Email deliverability optimization — inbox placement, authentication, sender reputation.

**Triggers:** "email deliverability", "emails going to spam", "DKIM", "sender reputation"

**Frameworks:** Authentication Checklist (SPF/DKIM/DMARC), Domain Health, List Hygiene, Warm-Up Schedule

**Tools:** web_fetch

**Related agents:** sequence-builder, segmentation, email-sequence

### segmentation
Email list segmentation strategy — behavioral segments, lifecycle stages, personalization.

**Triggers:** "segment my list", "email segmentation", "personalize emails"

**Frameworks:** 4 Segmentation Dimensions (Behavioral/Lifecycle/Source/Demographic), Tag Architecture, Personalization Levels

**Related agents:** sequence-builder, deliverability, analytics-interpreter

---

## Strategy & Planning (4 agents)

### marketing-strategist
Full-stack marketing strategy and prioritization. Assesses current state and builds plans.

**Triggers:** "marketing strategy", "marketing plan", "what should I focus on", "GTM strategy"

**Frameworks:** Channel Audit, Funnel Analysis, ICE Scoring, Strategic Archetypes by Revenue Stage

**Tools:** google_analytics

**Related agents:** content-calendar, campaign-planner, analytics-interpreter

### content-calendar
Content planning, scheduling, and editorial cadence aligned with business goals.

**Triggers:** "content calendar", "editorial calendar", "content plan", "content schedule"

**Frameworks:** Content Pillars, Content Mix by Type, Channel Cadence, Repurposing Flow

**Related agents:** marketing-strategist, blog-writer, video-script, social-content

### campaign-planner
Campaign architecture for launches, seasonal promotions, and evergreen campaigns.

**Triggers:** "campaign plan", "product launch", "launch strategy", "go-to-market"

**Frameworks:** Launch/Seasonal/Evergreen architectures, Messaging Framework, Channel Plans

**Related agents:** marketing-strategist, content-calendar, campaign-builder

### analytics-interpreter
Marketing data analysis and insight extraction. Translates metrics into strategic recommendations.

**Triggers:** "analyze my data", "marketing report", "what do these numbers mean"

**Frameworks:** Traffic/Channel/Conversion/Cohort analysis, "So What?" Framework, Anomaly Detection

**Tools:** google_search_console, google_analytics

**Related agents:** marketing-strategist, budget-optimizer, seo-auditor

---

## Growth Engineering (3 agents)

### referral-program
Referral and affiliate program design — incentive structures and viral mechanics.

**Triggers:** "referral program", "affiliate program", "referral marketing", "word of mouth"

**Frameworks:** 5 Program Models, Incentive Design, Referral Loop, Viral Coefficient Metrics

**Related agents:** viral-loop, marketing-strategist, email-sequence

### free-tool-strategy
Free tools, calculators, and assessments as lead generation and SEO assets.

**Triggers:** "free tool", "calculator", "assessment", "lead magnet tool"

**Frameworks:** 7 Tool Types, Value Exchange, Product-Led Growth Alignment, Gate Strategies

**Tools:** web_fetch

**Related agents:** seo-auditor, keyword-researcher, landing-page

### viral-loop
Growth loops, network effects, and product-led growth design.

**Triggers:** "viral loop", "growth loop", "network effects", "product-led growth", "PLG"

**Frameworks:** 4 Loop Types (Viral/Content/Paid/Engagement), Loop Design Framework, Anti-Patterns

**Related agents:** referral-program, free-tool-strategy, marketing-strategist

---

## Reference Documents

Agents load these deep reference materials on demand:

| Reference | Used By | Content |
|-----------|---------|---------|
| `sales/sales-methodology.md` | Sales agents | Pipeline stages, MEDDIC, BANT, objection handling, metrics, email templates |
| `content/copy-frameworks.md` | Content agents | AIDA, PAS, BAB, headline formulas, CTA patterns |
| `content/email-templates.md` | Email agents | Welcome, sales, re-engagement email templates |
| `content/headline-formulas.md` | Content agents | 10 headline archetypes, platform-specific rules |
| `seo/audit-checklist.md` | SEO agents | 5-tier comprehensive SEO audit checklist |
| `seo/programmatic-playbooks.md` | SEO agents | 8 playbooks for scaled page generation |
| `seo/schema-patterns.md` | SEO agents | JSON-LD schema markup patterns |
| `cro/experiment-library.md` | CRO agents | Proven A/B test experiments with expected lifts |
| `cro/pricing-models.md` | CRO agents | SaaS pricing models, psychology, optimization |

## Contributing New Agents

1. Create a YAML file in `agents/[category]/[agent-name].yaml`
2. Follow the structure above (name, category, description, model, system_prompt, references, tools, related_agents)
3. Include discovery questions, frameworks, and a structured output format in the system prompt
4. Add reference docs in `references/[category]/` if the agent needs deep context
5. Submit a PR
