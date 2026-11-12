import {
  ArrowRight,
  Check,
  CirclePause,
  Crown,
  FolderKanban,
  Github,
  LockKeyhole,
  Menu,
  MonitorDown,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";

const githubUrl = "https://github.com/xiaolinggmm/cordantry";
const downloadUrl = `${githubUrl}/releases/latest`;

type AgentType = "codex" | "claude" | "antigravity";

function AgentIcon({ type }: { type: AgentType }) {
  const label = type === "codex" ? "Codex Agent" : type === "claude" ? "Claude Code Agent" : "Antigravity Agent";
  return (
    <span className={`agent-icon agent-${type}`} role="img" aria-label={label}>
      {type === "codex" && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.911 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.182a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.096 5.98 5.98 0 0 0 .511 4.911 6.051 6.051 0 0 0 6.514 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.989 5.989 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073Zm-9.022 12.608a4.476 4.476 0 0 1-2.877-1.041l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.682v-6.736l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494Zm-9.661-4.125a4.471 4.471 0 0 1-.534-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.368v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.499 4.499 0 0 1-6.141-1.646ZM2.341 7.896a4.485 4.485 0 0 1 2.365-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.354-2.02 1.168a.076.076 0 0 1-.071 0l-4.831-2.786a4.504 4.504 0 0 1-1.646-6.141v.024Zm16.596 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.104v-5.677a.79.79 0 0 0-.407-.667Zm2.011-3.023-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.831-2.787a4.499 4.499 0 0 1 6.68 4.66ZM8.307 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.499 4.499 0 0 1 7.376-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681l-.005 6.723Zm1.098-2.365 2.602-1.5 2.607 1.5v2.999l-2.598 1.5-2.607-1.5-.004-2.999Z" /></svg>}
      {type === "claude" && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.714 15.956 4.718-2.648.079-.23-.079-.128h-.231l-.789-.049-7.169-.291-.571-.122-.534-.704.055-.352.479-.322 6.579.419 2.447.255h.388l.055-.158-.237-.194-5.527-3.692-1.336-.971-.722-.492-.364-.461-.158-1.008.656-.722.88.06 4.823 3.65.364.304.146-.103.018-.073-.164-.273-3.443-5.968-.17-.619-.103-.729.443-.88.413-.134.996.134.419.364 4.165 8.57.243.832.091.255h.158v-.146l.443-4.801.237-2.696.079-.759.376-.91.747-.492.583.28.48.686-.067.443-1.208 6.697h.213l.243-.243 3.363-4.189.85-.905.546-.431h1.032l.759 1.129-.34 1.166-4.068 5.55.073.109.188-.018 7.067-1.202.832.388.091.395-.328.807-7.753 1.761-.043.031.049.06 7.63.407.789.522.474.638-.079.486-1.214.619-6.776-1.627h-.182v.109l7.704 7.209.127.577-.322.455-.34-.049-7.181-5.678h-.128v.17l2.787 4.171.121 1.081-.17.352-.607.213-.668-.122-4.146-5.872-.14.079-.674 7.255-.315.37-.729.28-.607-.462-.322-.747 1.007-6.83.17-.632-.012-.042-.14.018-5.336 6.758-.413.164-.716-.371.067-.662.401-.589 4.754-6.005-.006-.158h-.055l-6.338 4.117-1.129.145-.486-.455.061-.747.231-.243 1.906-1.311Z" /></svg>}
      {type === "antigravity" && <svg viewBox="0 0 180 180" aria-hidden="true"><path d="M144.248 149.062c7.5 5.626 18.75 1.876 8.437-8.437-30.937-30-24.375-112.5-62.812-112.5s-31.875 82.5-62.813 112.5c-11.25 11.25.938 14.063 8.438 8.437 29.062-19.687 27.187-54.375 54.375-54.375s25.312 34.688 54.375 54.375Z" /></svg>}
    </span>
  );
}

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="Cordantry home">
      <span className="brand-mark" aria-hidden="true"><span /></span>
      <span>Cordantry</span>
    </a>
  );
}

function ProductDemo() {
  return (
    <section className="demo-section" id="product" aria-labelledby="demo-title">
      <div className="section-intro compact">
        <p className="eyebrow">How Cordantry works</p>
        <h2 id="demo-title">One direction. A company in motion.</h2>
      </div>
      <div className="operating-illustration" role="img" aria-label="Cordantry operating loop">
        <span className="sr-only">The founder sets a direction. Cordantry coordinates Agent roles, returns strategic decisions to the founder, and delivers an outcome.</span>
        <svg className="flow-map" viewBox="0 0 1120 560" aria-hidden="true">
          <path className="flow-path path-to-company" d="M250 280 C330 280 330 186 420 186" />
          <path className="flow-path path-to-decision" d="M700 186 C790 186 770 280 860 280" />
          <path className="flow-path path-to-outcome" d="M700 374 C790 374 770 280 860 280" />
          <path className="flow-path path-return" d="M860 316 C824 468 300 492 220 330" />
        </svg>

        <div className="loop-card founder-direction">
          <div className="loop-card-head"><span className="founder-avatar">F</span><strong>Founder direction</strong></div>
          <div className="prompt-lines" aria-hidden="true"><i /><i /><i /></div>
          <span className="send-signal"><ArrowRight size={14} /></span>
        </div>

        <div className="company-system">
          <div className="company-system-head">
            <span className="brand-mark small" aria-hidden="true"><span /></span>
            <strong>Company operating</strong>
            <i className="live-dot" />
          </div>
          <div className="agent-roles">
            <div className="ceo-agent"><span>CEO</span><strong>CEO Agent</strong><AgentIcon type="antigravity" /></div>
            <div className="role-card role-research"><span>R</span><strong>Research</strong><AgentIcon type="claude" /><i /></div>
            <div className="role-handoff handoff-one"><ArrowRight size={13} /></div>
            <div className="role-card role-product"><span>P</span><strong>Product</strong><AgentIcon type="codex" /><i /></div>
            <div className="role-handoff handoff-two"><ArrowRight size={13} /></div>
            <div className="role-card role-build"><span>B</span><strong>Build</strong><AgentIcon type="antigravity" /><i /></div>
          </div>
        </div>

        <div className="loop-card founder-decision">
          <div className="attention-dot">!</div>
          <strong>Needs you</strong>
          <div className="choice-lines" aria-hidden="true"><i /><i /></div>
        </div>

        <div className="loop-card company-outcome">
          <div className="outcome-check"><Check size={16} /></div>
          <strong>Outcome</strong>
          <div className="artifact-stack" aria-hidden="true"><i /><i /><i /></div>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  return (
    <div id="top">
      <header className="site-header">
        <Logo />
        <nav className={menuOpen ? "site-nav open" : "site-nav"} aria-label="Main navigation">
          <a href="#product" onClick={() => { setMenuOpen(false); setFaqOpen(false); }}>Product</a>
          <a href="#difference" onClick={() => { setMenuOpen(false); setFaqOpen(false); }}>Why Cordantry</a>
          <button type="button" aria-expanded={faqOpen} aria-controls="faq-panel" onClick={() => { setFaqOpen((value) => !value); setMenuOpen(false); }}>FAQ</button>
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <a className="header-cta" href={downloadUrl}>Download <ArrowRight size={15} /></a>
        <button className="menu-button" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        {faqOpen && (
          <div className="nav-faq" id="faq-panel" role="dialog" aria-label="Frequently asked questions">
            <div className="nav-faq-head"><span>FAQ</span><button type="button" aria-label="Close FAQ" onClick={() => setFaqOpen(false)}><X size={18} /></button></div>
            <div className="faq-list">
              <details><summary>Is Cordantry another AI chat app?<span>+</span></summary><p>No. It turns a goal into coordinated roles, handoffs, decisions, and verified outcomes.</p></details>
              <details><summary>Does it require several different AI models?<span>+</span></summary><p>No. MAH selects from the Agents you have configured; a multi-model setup is not required.</p></details>
              <details><summary>When does Cordantry interrupt me?<span>+</span></summary><p>Only for founder judgment, sensitive permission, or a decision that materially changes the work.</p></details>
              <details><summary>Where does my work run?<span>+</span></summary><p>On your computer, against the local project you choose.</p></details>
              <details><summary>What do I need to get started?<span>+</span></summary><p>Cordantry, MAH, and at least one Agent configured in MAH.</p></details>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="hero">
          <div className="hero-orbit orbit-one" aria-hidden="true" />
          <div className="hero-orbit orbit-two" aria-hidden="true" />
          <p className="hero-kicker"><span /> Built for founders who want leverage, not another inbox</p>
          <h1>Run a company<br />of AI agents.</h1>
          <p className="founder-line">You are the founder.</p>
          <p className="hero-copy">Set the direction. Your Agent team plans, delegates, and moves the work forward. Cordantry brings you the decisions, progress, and results that matter—without making you manage every task.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#product">Watch Cordantry work <ArrowRight size={17} /></a>
            <a className="secondary-button" href={downloadUrl}><MonitorDown size={17} /> Download Cordantry</a>
          </div>
          <a className="github-link" href={githubUrl} target="_blank" rel="noreferrer"><Github size={16} /> View on GitHub</a>
        </section>

        <ProductDemo />

        <section className="responsibility section" aria-labelledby="responsibility-title">
          <div className="section-intro responsibility-intro">
            <p className="eyebrow">One clear boundary</p>
            <h2 id="responsibility-title">Your company runs.<br />You stay in control.</h2>
            <p>You set direction. Cordantry carries the work.</p>
          </div>
          <div className="founder-control-loop" role="img" aria-label="Founder control loop">
            <span className="sr-only">The founder sets direction. Cordantry runs the company, returns judgment calls to the founder, and prepares a verified report.</span>
            <div className="founder-sequence">
              <div className="console-head"><span className="person-icon" role="img" aria-label="Founder"><UserRound size={17} /></span><strong>Founder</strong></div>
              <div className="direction-input"><span>Your direction</span><i /><i /><ArrowRight size={14} /></div>
            </div>
            <span className="send-orb" aria-hidden="true"><ArrowRight size={16} /></span>
            <div className="company-sequence">
              <div className="console-head"><span className="brand-mark small" aria-hidden="true"><span /></span><strong>Company running</strong><i className="live-dot" /></div>
              <div className="continuous-agents">
                <div className="agent-arrival"><AgentIcon type="antigravity" /><strong className="agent-role">CEO</strong><i /><span /></div>
                <div className="agent-arrival"><AgentIcon type="claude" /><strong className="agent-role">Research</strong><i /><span /></div>
                <div className="agent-arrival"><AgentIcon type="codex" /><strong className="agent-role">Product</strong><i /><span /></div>
                <div className="agent-arrival"><AgentIcon type="antigravity" /><strong className="agent-role">Build</strong><i /><span /></div>
              </div>
            </div>
            <div className="permission-moment">
                <div className="console-head"><span className="permission-icon"><LockKeyhole size={16} /></span><strong>Needs your judgment</strong><span className="founder-chip">You</span></div>
                <div className="decision-context" aria-hidden="true"><i /><i /><i /></div>
                <div className="decision-choices" aria-hidden="true"><i /><i /></div>
            </div>
            <div className="ceo-result">
                <div className="console-head"><span className="person-icon ceo-icon" role="img" aria-label="CEO Agent"><Crown size={17} /></span><strong>CEO</strong><span className="recipient-icon" aria-label="Presented to Founder"><UserRound size={14} /></span></div>
                <div className="result-title"><span className="outcome-check"><Check size={14} /></span><strong>Founder report ready</strong></div>
                <div className="report-summary" aria-hidden="true"><i /><i /><i /></div>
                <div className="report-artifacts" aria-hidden="true"><i /><i /><i /></div>
            </div>
          </div>
        </section>

        <section className="difference section" id="difference" aria-labelledby="difference-title">
          <div className="section-intro">
            <p className="eyebrow">A different operating model</p>
            <h2 id="difference-title">Beyond prompts and pipelines.</h2>
          </div>
          <div className="comparison" role="table" aria-label="Cordantry product comparison">
            <div className="comparison-row head" role="row"><span role="columnheader"> </span><span role="columnheader">Workflow automation</span><span role="columnheader">Single Agent</span><span role="columnheader" className="cordantry-column">Cordantry</span></div>
            <div className="comparison-row" role="row"><strong role="rowheader">Starts with</strong><span>Rules</span><span>A prompt</span><span className="cordantry-column">A company goal</span></div>
            <div className="comparison-row" role="row"><strong role="rowheader">Coordinates</strong><span>Steps</span><span>One context</span><span className="cordantry-column">Roles, work, and handoffs</span></div>
            <div className="comparison-row" role="row"><strong role="rowheader">Brings you</strong><span>Exceptions</span><span>Every turn</span><span className="cordantry-column">Strategic decisions</span></div>
            <div className="comparison-row" role="row"><strong role="rowheader">Ends with</strong><span>A completed run</span><span>An answer</span><span className="cordantry-column">An accepted business outcome</span></div>
          </div>
        </section>

        <section className="use-cases section" aria-labelledby="use-cases-title">
          <div className="section-intro"><p className="eyebrow">Put the company to work</p><h2 id="use-cases-title">From direction to finished work.</h2></div>
          <div className="use-case-grid">
            <article><span>01</span><h3>Validate a new market</h3><p>Research the landscape, sharpen the position, and turn evidence into a founder decision.</p></article>
            <article><span>02</span><h3>Build a product release</h3><p>Coordinate product, engineering, and verification around accepted handoffs.</p></article>
            <article><span>03</span><h3>Prepare a launch</h3><p>Bring the offer, launch assets, and risks together in one founder report.</p></article>
          </div>
        </section>

        <section className="control section" aria-labelledby="control-title">
          <div className="control-copy"><p className="eyebrow">Local control</p><h2 id="control-title">Autonomy with an audit trail.</h2></div>
          <div className="control-visual" role="img" aria-label="Local control flow">
            <span className="sr-only">Work moves from your local project through an explicit permission gate to Agent work and accepted proof. You can pause it at any time.</span>
            <div className="control-node project-node"><FolderKanban /><strong>Your project</strong></div>
            <ArrowRight className="control-arrow" aria-hidden="true" />
            <div className="control-node gate-node"><LockKeyhole /><strong>Permission gate</strong></div>
            <ArrowRight className="control-arrow" aria-hidden="true" />
            <div className="control-node proof-node"><ShieldCheck /><strong>Accepted proof</strong></div>
            <div className="pause-chip"><CirclePause size={15} /> Pause anytime</div>
          </div>
        </section>

        <section className="final-cta">
          <div><p className="eyebrow">Your direction. A company in motion.</p><h2>Run your first<br />Agent company.</h2></div>
          <div className="final-actions"><a className="light-button" href={downloadUrl}>Download Cordantry <ArrowRight size={17} /></a><a href={githubUrl} target="_blank" rel="noreferrer"><Github size={17} /> View on GitHub</a></div>
        </section>
      </main>

      <footer><Logo /><span>Open source · Local first</span><span>© {new Date().getFullYear()} Cordantry</span></footer>
    </div>
  );
}

export default App;
