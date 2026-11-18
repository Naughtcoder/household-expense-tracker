// Shown the instant a link is tapped, so navigation never looks dead while the
// server talks to the database.
export default function Loading() {
  return (
    <main className="wrap grid" style={{ gap: 18, paddingTop: 68 }}>
      <div className="card hero">
        <div className="sk" style={{ width: 120, height: 11 }} />
        <div className="sk" style={{ width: 200, height: 38, marginTop: 14 }} />
        <div className="sk" style={{ width: 260, height: 12, marginTop: 12 }} />
        <div className="sk" style={{ height: 7, marginTop: 20, borderRadius: 999 }} />
      </div>
      <div className="grid cols-3">
        {[0, 1, 2].map(i => (
          <div className="card" key={i}>
            <div className="sk" style={{ width: 80, height: 10 }} />
            <div className="sk" style={{ width: 130, height: 24, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="sk" style={{ width: 110, height: 14 }} />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '15px 0' }}>
            <div className="sk" style={{ width: `${45 - i * 5}%`, height: 13 }} />
            <div className="sk" style={{ width: 70, height: 13 }} />
          </div>
        ))}
      </div>
    </main>
  )
}
