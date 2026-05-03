import { Link } from 'react-router-dom';

const steps = [
  {
    number: '01',
    title: 'Upload Transcript PDF',
    description:
      'Staff uploads a nursing school transcript. The file is securely transferred to S3 via a presigned URL — never stored in the browser.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'AI Extraction & Verification',
    description:
      'Amazon Textract runs OCR. Nova Pro structures courses, GPA, and dates. 18 deterministic rules fire. Nova Pro performs holistic fraud analysis.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Human Review & Audit',
    description:
      'Staff reviews every AI finding, can override or annotate, and submits a decision. Every action is permanently logged in an immutable audit trail.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const ruleCategories = [
  {
    title: 'Graduation & Conferral',
    color: 'bg-blue-50 border-blue-200',
    titleColor: 'text-blue-800',
    dotColor: 'bg-blue-400',
    rules: [
      'Graduation date present on transcript',
      'Degree explicitly conferred / awarded',
      'Graduation date is not in the future',
    ],
  },
  {
    title: 'Program Completion',
    color: 'bg-green-50 border-green-200',
    titleColor: 'text-green-800',
    dotColor: 'bg-green-400',
    rules: [
      'Minimum credit hours met (ADN 60 / BSN 120 / MSN 36 / LPN 40)',
      'Required nursing core courses present',
      'Cumulative GPA meets minimum threshold (2.0)',
      'No failing grades in core nursing courses',
    ],
  },
  {
    title: 'Accreditation',
    color: 'bg-purple-50 border-purple-200',
    titleColor: 'text-purple-800',
    dotColor: 'bg-purple-400',
    rules: [
      'Institution is on the approved school list',
      'Program type matches an accredited program at that institution',
    ],
  },
  {
    title: 'Fraud Indicators',
    color: 'bg-red-50 border-red-200',
    titleColor: 'text-red-800',
    dotColor: 'bg-red-400',
    rules: [
      'Conferral date is not before enrollment began',
      'GPA is within plausible range (0.0 – 4.0)',
      'Credit hours per term are within plausible bounds',
      'No duplicate course entries detected',
    ],
  },
];

const techStack = [
  { name: 'Amazon Textract', desc: 'Async OCR' },
  { name: 'Bedrock Nova Pro', desc: 'Extraction + analysis' },
  { name: 'Bedrock Nova Pro', desc: 'Holistic AI analysis' },
  { name: 'AWS Step Functions', desc: 'Pipeline orchestration' },
  { name: 'Amazon DynamoDB', desc: 'Verification records' },
  { name: 'Amazon S3', desc: 'Secure transcript storage' },
];

export default function Home() {
  return (
    <div className="-mt-6">

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-msbon-900 via-msbon-800 to-msbon-700 text-white">
        {/* decorative grid */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl">
            {/* badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Mississippi AI Innovation Hub — Proof of Concept
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-6">
              AI-Assisted Transcript<br />
              <span className="text-blue-300">Verification for Nursing</span><br />
              Licensure
            </h1>

            <p className="text-lg text-blue-100 mb-10 max-w-2xl leading-relaxed">
              The Mississippi State Board of Nursing reviews hundreds of transcripts
              manually every year. This system uses Amazon Bedrock and 18 deterministic
              rules to flag anomalies, detect fraud indicators, and produce auditable
              findings — so staff can focus on the decisions that matter.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                to="/upload"
                className="px-6 py-3 bg-white text-msbon-800 font-semibold rounded-lg hover:bg-blue-50 transition-colors shadow-lg"
              >
                Upload a Transcript
              </Link>
              <Link
                to="/dashboard"
                className="px-6 py-3 bg-white/10 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        </div>

        {/* wave separator */}
        <div className="relative h-16">
          <svg viewBox="0 0 1440 64" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,64 C360,0 1080,64 1440,0 L1440,64 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── PROBLEM CONTEXT ── */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Operation Nightingale callout */}
          <div className="md:col-span-1 bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-bold text-red-700 uppercase tracking-wide">Operation Nightingale</span>
            </div>
            <p className="text-sm text-red-800 leading-relaxed">
              A federal investigation uncovered a fraudulent nursing credential scheme that placed
              unqualified nurses in healthcare settings across the country. Boards of nursing
              are now under pressure to strengthen transcript verification — manually.
            </p>
          </div>

          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <div className="w-10 h-10 bg-msbon-100 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-msbon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">The Manual Problem</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              MSBN staff manually review every transcript submitted for first-time licensure
              and endorsement. Reviews are time-consuming, inconsistent across reviewers,
              and leave little capacity to catch sophisticated fraud.
            </p>
          </div>

          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">The AI Approach</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              This system standardizes every check, flags anomalies automatically, and explains
              every finding in plain language — so staff can review with confidence and full
              context. AI augments the reviewer; it never replaces them.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bg-gray-50 border-y">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How It Works</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              A fully automated pipeline runs in under 5 minutes. Staff only engage at the review step.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* connector lines (desktop only) */}
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-msbon-200 via-msbon-400 to-msbon-200" />

            {steps.map((step) => (
              <div key={step.number} className="relative bg-white rounded-xl border p-6 shadow-sm text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-msbon-50 text-msbon-700 rounded-xl mb-4">
                  {step.icon}
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-msbon-800 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  {step.number}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

          {/* pipeline detail strip */}
          <div className="mt-10 bg-msbon-900 rounded-xl p-5 flex flex-wrap justify-center gap-3 text-sm">
            {['PDF Upload → S3', 'Textract OCR', 'Nova Pro Extraction', '18 Rule Checks', 'Nova Pro Analysis', 'Report Generated', 'Staff Review'].map((label, i, arr) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-blue-200 font-medium">{label}</span>
                {i < arr.length - 1 && <span className="text-msbon-600 font-bold">→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT THE AI CHECKS ── */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">18 Verification Rules, 4 Categories</h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Every transcript is evaluated against the same deterministic ruleset before AI analysis begins.
            Nothing is skipped. Everything is explained.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {ruleCategories.map((cat) => (
            <div key={cat.title} className={`border rounded-xl p-6 ${cat.color}`}>
              <h3 className={`font-bold text-base mb-4 ${cat.titleColor}`}>{cat.title}</h3>
              <ul className="space-y-2">
                {cat.rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${cat.dotColor}`} />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-gray-50 border rounded-xl p-5 flex items-start gap-3">
          <svg className="w-5 h-5 text-msbon-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-gray-600">
            Every rule result includes a <strong>status</strong> (PASS / FLAG / UNABLE TO DETERMINE),
            a <strong>plain-language explanation</strong>, and the <strong>exact source section</strong> from the
            transcript it was drawn from. No black-box outputs.
          </p>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="bg-msbon-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <p className="text-center text-blue-300 text-sm font-semibold uppercase tracking-widest mb-8">
            Built on AWS — Serverless, Scalable, Auditable
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {techStack.map((t) => (
              <div key={t.name} className="bg-white/10 border border-white/10 rounded-lg p-4 text-center">
                <p className="font-semibold text-sm text-white">{t.name}</p>
                <p className="text-xs text-blue-300 mt-1">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Ready to verify a transcript?</h2>
        <p className="text-gray-500 mb-8 max-w-lg mx-auto">
          Upload a nursing school transcript PDF and the pipeline runs automatically.
          Results are ready for human review in under 5 minutes.
        </p>
        <div className="flex justify-center gap-4 flex-wrap">
          <Link
            to="/upload"
            className="px-8 py-3 bg-msbon-700 text-white font-semibold rounded-lg hover:bg-msbon-800 transition-colors shadow"
          >
            Upload Transcript
          </Link>
          <Link
            to="/dashboard"
            className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Dashboard
          </Link>
        </div>

        <div className="mt-12 pt-8 border-t">
          <p className="text-xs text-gray-400 max-w-2xl mx-auto">
            Advisory outputs only. This system never approves or denies a nursing license.
            All AI findings require human review before any action is taken.
            Developed as part of the Mississippi AI Innovation Hub.
          </p>
        </div>
      </section>
    </div>
  );
}
