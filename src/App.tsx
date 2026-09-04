const sections = ['Playground', 'Storage', 'Timeline', 'Workload', 'Recovery']

function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Storage engine observability</p>
          <h1>TinyLSM Lab</h1>
        </div>
        <span className="connection">Backend not connected</span>
      </header>

      <nav aria-label="Lab sections" className="tabs">
        {sections.map((section, index) => (
          <button className={index === 0 ? 'active' : ''} key={section} type="button">
            {section}
          </button>
        ))}
      </nav>

      <section className="workspace">
        <article className="panel operation-panel">
          <p className="label">Operation</p>
          <h2>Explore a database session</h2>
          <p>
            The UI shell is ready. The next step is to connect it to the C++ lab
            server and expose database state snapshots.
          </p>
          <div className="actions">
            <button type="button">Open database</button>
            <button className="secondary" type="button">Run workload</button>
          </div>
        </article>

        <aside className="panel state-panel">
          <p className="label">Live state</p>
          <dl>
            <div><dt>MemTable</dt><dd>—</dd></div>
            <div><dt>Next sequence</dt><dd>—</dd></div>
            <div><dt>Active WAL</dt><dd>—</dd></div>
            <div><dt>SSTables</dt><dd>—</dd></div>
          </dl>
        </aside>
      </section>
    </main>
  )
}

export default App

