# Pricing Models Reference

## SaaS Pricing Models

### Flat-Rate Pricing
**Structure:** One price, one product, all features included.

| Pros | Cons |
|------|------|
| Simple to communicate | Can't capture different willingness to pay |
| Easy to manage | Revenue capped per customer |
| No decision fatigue | May be too expensive for small users |

**Best for:** Simple products, SMB-focused, early-stage.
**Example:** Basecamp — $99/month flat, unlimited users.

### Per-Seat / Per-User
**Structure:** Price scales with number of users.

| Pros | Cons |
|------|------|
| Revenue grows with adoption | Incentivizes fewer seats (shared logins) |
| Predictable for both sides | Doesn't capture value from power users |
| Easy to understand | Enterprise pushback on high seat counts |

**Best for:** Collaboration tools, team-based products.
**Example:** Slack — $8.75/user/month.

### Usage-Based
**Structure:** Pay for what you use (API calls, emails sent, storage, etc.).

| Pros | Cons |
|------|------|
| Aligns with value delivered | Unpredictable revenue |
| Low barrier to start | Customers fear bill shock |
| Scales naturally with growth | Hard to forecast |

**Best for:** Infrastructure, APIs, variable consumption.
**Example:** AWS, Twilio, SendGrid.

### Tiered (Feature-Based)
**Structure:** Multiple plans with escalating features.

| Pros | Cons |
|------|------|
| Captures different willingness to pay | Plan selection can cause friction |
| Clear upgrade path | Feature allocation is subjective |
| Good/Better/Best is intuitive | Mid-tier cannibalization risk |

**Best for:** Most SaaS products. The industry standard.
**Example:** Most SaaS products — Starter / Pro / Enterprise.

### Freemium
**Structure:** Free tier with limited features, paid for more.

| Pros | Cons |
|------|------|
| Massive top-of-funnel | Most users never pay (2-5% typical) |
| Word-of-mouth growth | Free users have support costs |
| Network effects | Hard to find the right free/paid line |

**Best for:** Products with network effects, low marginal cost, viral potential.
**Example:** Notion, Calendly, Slack.

### Hybrid
**Structure:** Combination of models (e.g., per-seat + usage + tiers).

| Pros | Cons |
|------|------|
| Captures maximum value | Complex to communicate |
| Flexible for different segments | Hard to manage and forecast |
| Reduces gaming | Customer confusion |

**Best for:** Mature products with diverse customer base.
**Example:** HubSpot — Tier (Starter/Pro/Enterprise) × Seats × Contacts.

## The Good/Better/Best Framework

The standard SaaS pricing structure. Three tiers designed to guide most customers to the middle option.

### Tier Design

| Tier | Purpose | Pricing | Target |
|------|---------|---------|--------|
| **Good** (Starter) | Get people in the door | Low, accessible | Price-sensitive, evaluators |
| **Better** (Pro) | Sweet spot, most features | 2-3x Good tier | Core market, most customers |
| **Best** (Enterprise) | Anchor + capture high-value | 3-5x Pro tier | Large teams, high requirements |

### Feature Allocation Strategy
- **Good tier:** Core functionality that delivers the basic promise
- **Better tier:** Everything in Good + power features that drive real value
- **Best tier:** Everything in Better + scale, security, compliance, support

### Pricing Psychology for Tiers
- **Anchor effect:** Enterprise price makes Pro look reasonable
- **Decoy effect:** Good tier exists to make Better look like best value
- **Most Popular badge:** Visual nudge toward target tier
- **Default selection:** Pre-select the tier you want most people on

## Value Metrics

The value metric is what you charge per unit of. Choosing the right one is the most important pricing decision.

### Good Value Metrics
| Metric | When It Works |
|--------|-------------|
| Per user/seat | Product value scales with team size |
| Per 1,000 contacts | Email/CRM tools |
| Per 1,000 API calls | Developer tools |
| Per GB stored | Storage products |
| Per project | Project-based tools |
| Per revenue generated | Affiliate, marketplace |

### Choosing a Value Metric
A good value metric should:
1. **Align with value:** Customer pays more when they get more value
2. **Be easy to understand:** Customer can predict their bill
3. **Grow with the customer:** Revenue expands as they grow
4. **Be hard to game:** Can't artificially reduce usage to pay less

## Pricing Page Best Practices

### Layout
- 3 plans (Good/Better/Best), occasionally 4
- Highlight recommended plan (larger card, badge, contrasting color)
- Monthly/annual toggle (annual saves 15-20%)
- Feature comparison table below cards for detail-oriented buyers
- FAQ section addressing pricing objections

### Copy
- Lead with outcome, not price ("Start growing faster" not "$49/month")
- Name plans by value, not size ("Growth" not "Medium")
- Show per-month price even for annual (looks lower)
- Highlight what's included, not what's excluded in each tier
- Use "Starting at" for enterprise/custom pricing

### Social Proof on Pricing Page
- Customer count ("Join 10,000+ teams")
- Customer logos (recognizable brands)
- Testimonial near CTA (about value, not price)
- Rating badges (G2, Capterra)

### Objection Handling
- "Can I switch plans?" → Yes, upgrade/downgrade anytime
- "Is there a free trial?" → Yes, [duration] days, no credit card
- "What if I need to cancel?" → Cancel anytime, no long-term contracts
- "Is my data secure?" → [Security certifications]
- "Do you offer discounts?" → Annual billing saves X%, nonprofit/education discounts

## Revenue Optimization Levers

### Quick Wins (Implement This Week)
1. **Raise prices 10-20%** — Most SaaS is underpriced. Test on new signups.
2. **Add annual billing option** — 15-20% discount, improves cash flow and retention.
3. **Highlight recommended plan** — Visual emphasis increases selection 10-25%.

### Medium-Term (This Quarter)
4. **Add enterprise tier** — Even if few buy it, it anchors pricing.
5. **Usage-based add-ons** — Let power users pay more for heavy usage.
6. **Remove lowest tier or raise its price** — If it's cannibalizing growth tier.

### Strategic (This Year)
7. **Switch value metric** — If current metric doesn't align with value delivered.
8. **Introduce platform pricing** — Base fee + per-unit pricing for scale.
9. **Expansion revenue programs** — Proactive upsell at usage thresholds.

## Pricing Research Methods

| Method | What You Learn | Effort |
|--------|---------------|--------|
| Van Westendorp | Acceptable price range | Low |
| Conjoint Analysis | Feature-price trade-offs | High |
| Competitor Benchmarking | Market pricing norms | Low |
| Customer Interviews | Willingness to pay + reasons | Medium |
| A/B Test on Pricing Page | What converts best | Medium |

### Van Westendorp (Quick & Useful)
Ask 4 questions:
1. At what price would this be **too expensive** to consider?
2. At what price would this be **expensive but worth considering**?
3. At what price would this be a **bargain**?
4. At what price would this be **so cheap you'd question quality**?

Plot the curves. The intersection points show your acceptable price range.

## Common Pricing Mistakes

1. **Pricing too low** — Signals low value. Hard to raise later.
2. **Too many tiers** — Choice paralysis. 3 tiers is optimal.
3. **Free tier too generous** — No reason to upgrade.
4. **No annual option** — Missing cash flow and retention benefits.
5. **Feature-gating core value** — Free tier should show the product's magic.
6. **Not raising prices** — Inflation alone justifies annual increases.
7. **Same price for all segments** — SMBs and enterprises have different budgets.
8. **Hiding pricing** — B2B buyers research pricing before talking to sales.
