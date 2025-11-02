# Birth Probability Explorer

The Birth Probability Explorer is a minimalist, static web app that visualizes the modeled probability of giving birth on or after a due date. Users can adjust due date, maternal age band, and parity to see how the weekly and daily likelihoods shift. The tool is lightweight (HTML/CSS/JS + JSON) and ready for any static host such as Cloudflare Pages.

## Methodology (What the Numbers Mean)

- **Weekly share** represents the unconditional share of births occurring in each gestational week based on the modeled distribution.
- **Tail share** is the conditional probability for a week given you have already reached that gestational week (we renormalize over the remaining weeks).
- **Probability today** is simply the current week’s tail share divided by seven; we assume a flat distribution across the seven days of each week.

These probabilities describe when births actually occur in contemporary practice (including inductions and planned C-sections), not only spontaneous labor.

## Data Sources & Base Curve

- Baseline data: U.S. singleton births (2022) using the National Center for Health Statistics (NCHS) Obstetric Estimate (OE) of gestational age.
- Weeks 37–41 follow the exact single-week percentages published in National Vital Statistics Reports (NVSR 73-01, *Births: Final Data for 2022*).
- Week 42+ is capped at 0.27% of births; weeks <37 are scaled to match the reported 8.67% preterm total.
- Age bands (<20, 20–29, 30–39, 40+) use the Table 2 category totals (Preterm, Early-term 37–38, Full-term 39–40, Late/Post 41+). Where single-week splits aren’t published by age, we apportion within-category weeks using the overall 2022 ratios (37 vs 38; 39 vs 40; 41 vs 42+) while preserving each band’s totals.

## Parity × Age Modeling and Limitations

- Parity is the strongest predictor of labor timing. Until fully empirical parity×age tables ship, parity is modeled as a small timing shift: first births trend ~2 days later, later births ~2 days earlier, matching time-to-event analyses of spontaneous labor (e.g., Smith, *Human Reproduction*, 2001).
- We rebalance to keep each age band’s category totals intact.
- All JSONs in `weights_*` were generated from CDC WONDER Natality (Expanded) by grouping OE gestational age (weekly, 17–47) × live-birth order (1 vs 2+) × maternal age, filtered to singletons. Replacing those extracts will remove the modeling step entirely.
- Caveats: figures reflect current U.S. practice patterns (indicated/scheduled deliveries included), assume a flat day-within-week split (weekday effects optional), and will vary by country/region; local vital statistics can recreate region-specific curves.

## Primary Sources

- NCHS, NVSR 73-01: *Births—Final Data for 2022* (single-week distribution, age-by-category totals; OE dating).
- CDC WONDER — Natality (Expanded) data dictionary & query tool (weekly OE GA; live-birth order; maternal age).
- Smith GC (2001), *Human Reproduction* — parity effect on spontaneous labor timing.

## Development & Deployment

The app lives in four files: `index.html`, `styles.css`, `app.js`, and `weights.json`, plus the `favicons/` directory. Serve locally with any static server:

```bash
python -m http.server
```

To deploy to Cloudflare Pages:

```bash
wrangler pages publish . --project-name birth-probability
```

This upload bundles the current directory while ignoring `.old/` (archived artifacts).

