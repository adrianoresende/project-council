const navigationLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Why use', href: '#why-use' },
  { label: 'Pricing', href: '#pricing' },
]

const processStages = [
  {
    step: 'Stage 1',
    title: 'Collect independent model responses',
    description:
      'Ask your council models in parallel and capture each raw answer, so nothing gets hidden behind a single output.',
  },
  {
    step: 'Stage 2',
    title: 'Run anonymous peer review',
    description:
      'Each model scores and ranks anonymous responses to reduce model favoritism and surface high-quality reasoning.',
  },
  {
    step: 'Stage 3',
    title: 'Synthesize a final council decision',
    description:
      'A chairman model combines the strongest arguments and rankings into one answer you can trust and audit.',
  },
]

const benefitCards = [
  {
    title: 'Higher-confidence decisions',
    description:
      'Replace single-model guesswork with multi-model deliberation that stress tests assumptions before answers ship.',
  },
  {
    title: 'Transparent model accountability',
    description:
      'Inspect raw responses, peer critiques, and aggregate ranking outputs to understand why the final answer wins.',
  },
  {
    title: 'Drop-in for production teams',
    description:
      'Connect OpenRouter models, run async stages, and keep a clear workflow your team can adopt without new ops burden.',
  },
]

const pricingPlans = [
  {
    name: 'Starter',
    price: '$0',
    cadence: '/month',
    description: 'For solo builders testing council-based prompting.',
    cta: 'Start free',
    featured: false,
    features: [
      '3 council runs per day',
      'Up to 3 models per council',
      'Core stage visibility',
      'Community support',
    ],
  },
  {
    name: 'Pro Council',
    price: '$99',
    cadence: '/month',
    description: 'For teams deploying critical workflows with confidence.',
    cta: 'Book a demo',
    featured: true,
    features: [
      'Unlimited council runs',
      'Up to 10 models per council',
      'Advanced audit history',
      'Priority support',
    ],
  },
]

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between rounded-full border border-slate-200 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
          <a href="/" className="text-sm font-semibold tracking-tight sm:text-base">
            LLM Council
          </a>
          <nav aria-label="Primary" className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            {navigationLinks.map((link) => (
              <a key={link.label} href={link.href} className="transition hover:text-slate-900">
                {link.label}
              </a>
            ))}
          </nav>
          <a
            href="#pricing"
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 sm:text-sm"
          >
            See plans
          </a>
        </header>

        <main className="mt-14 space-y-24 sm:mt-18 sm:space-y-28">
          <section aria-labelledby="hero-title" className="grid gap-10 lg:grid-cols-[1fr_19rem] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
                Multi-model deliberation, built for operators
              </p>
              <h1 id="hero-title" className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
                Ship answers your AI council can defend.
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-slate-600 sm:text-xl">
                LLM Council orchestrates independent model responses, anonymous peer ranking, and chairman synthesis so
                your team can make faster, safer decisions with clear evidence.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#pricing"
                  className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Start free
                </a>
                <a
                  href="#how-it-works"
                  className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                >
                  Explore workflow
                </a>
              </div>
            </div>
            <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Council output snapshot</p>
              <dl className="mt-6 space-y-4 text-sm text-slate-600">
                <div>
                  <dt>Models deliberating</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">8</dd>
                </div>
                <div>
                  <dt>Average decision time</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">22 sec</dd>
                </div>
                <div>
                  <dt>Ranked rationale visibility</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">100%</dd>
                </div>
              </dl>
            </aside>
          </section>

          <section id="how-it-works" aria-labelledby="how-it-works-heading" className="space-y-8">
            <div className="max-w-2xl">
              <h2 id="how-it-works-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                How it works
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                One prompt, three stages, full traceability. Every decision is built through debate instead of a single
                model response.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {processStages.map((stage) => (
                <article key={stage.step} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">{stage.step}</p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">{stage.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{stage.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="why-use" aria-labelledby="why-use-heading" className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div>
              <h2 id="why-use-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Why use LLM Council
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-slate-600">
                Teams building with AI need quality, speed, and governance at the same time. Council-style reasoning
                gives all three.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {benefitCards.map((benefit) => (
                  <article key={benefit.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">{benefit.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.description}</p>
                  </article>
                ))}
              </div>
            </div>
            <aside className="rounded-3xl border border-slate-200 bg-slate-900 p-7 text-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Trusted workflow</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">Built for teams that need audit-ready AI</h3>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-200">
                <li>• Anonymous ranking to reduce model bias</li>
                <li>• Side-by-side responses for transparent review</li>
                <li>• Final synthesis grounded in evidence</li>
              </ul>
            </aside>
          </section>

          <section id="pricing" aria-labelledby="pricing-heading" className="space-y-8">
            <div className="max-w-2xl">
              <h2 id="pricing-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Pricing
              </h2>
              <p className="mt-4 text-lg text-slate-600">Choose the plan that matches your council size and deployment pace.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {pricingPlans.map((plan) => (
                <article
                  key={plan.name}
                  className={`rounded-3xl border p-7 shadow-sm ${
                    plan.featured ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <h3 className="text-xl font-semibold tracking-tight">{plan.name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                  <p className="mt-5 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    <span className="pb-1 text-sm text-slate-600">{plan.cadence}</span>
                  </p>
                  <a
                    href="#"
                    className={`mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                      plan.featured
                        ? 'bg-slate-900 text-white hover:bg-slate-700'
                        : 'border border-slate-300 bg-white text-slate-900 hover:border-slate-600'
                    }`}
                  >
                    {plan.cta}
                  </a>
                  <ul className="mt-6 space-y-2 text-sm text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Stop shipping one-model answers without peer review.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">
              Create your first council in minutes and give your team a repeatable framework for high-stakes AI outputs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#pricing"
                className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Get started
              </a>
              <a
                href="#how-it-works"
                className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-600"
              >
                View stages
              </a>
            </div>
          </section>
        </main>

        <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>LLM Council</p>
          <p className="mt-1">Deliberate with multiple models. Decide with confidence.</p>
        </footer>
      </div>
    </div>
  )
}

export default App
