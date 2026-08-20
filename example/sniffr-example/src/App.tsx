import { Suspense, lazy, useState } from "react";

import "./App.css";

// null in production, so the dynamic import below is unreachable and the whole
// sniffr + zod graph is dropped from the bundle rather than merely unrendered
const SniffrDevtools = import.meta.env.DEV ? lazy(() => import("./sniffr-devtools")) : null;

export default function App() {
  const [log, setLog] = useState<string[]>([]);

  const call = async (label: string, input: string, init?: RequestInit) => {
    const response = await fetch(input, init);
    setLog((entries) => [`${init?.method ?? "GET"} ${label} → ${response.status}`, ...entries]);
  };

  return (
    <main>
      <h1>sniffr</h1>
      <p className="lede">
        Every button below hits <code>/api/users</code>. sniffr models what comes back and diffs it
        against the zod schemas in <code>src/sniffr.ts</code>. Open the pill to see what moved.
      </p>

      <div className="actions">
        <button type="button" onClick={() => void call("/api/users", "/api/users")}>
          Fetch (matches the schema)
        </button>
        <button type="button" onClick={() => void call("/api/users?drift=1", "/api/users?drift=1")}>
          Fetch (drifted response)
        </button>
        <button
          type="button"
          onClick={() =>
            void call("/api/users", "/api/users", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: "grace@example.com", role: "owner" }),
            })
          }
        >
          Post (drifted request body)
        </button>
      </div>

      {SniffrDevtools && (
        <Suspense fallback={null}>
          <SniffrDevtools />
        </Suspense>
      )}

      <p className="hint">
        The drifted response and the clean one are the <em>same</em> endpoint — sniffr merges both
        into one model, which is why <code>email</code> reads <code>string | null</code> rather than
        just <code>null</code>.
      </p>

      <ul className="log">
        {log.map((entry, index) => (
          <li key={`${entry}-${String(index)}`}>{entry}</li>
        ))}
      </ul>
    </main>
  );
}
