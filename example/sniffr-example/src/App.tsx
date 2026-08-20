import { Suspense, lazy, useState } from "react";

import { API } from "./sniffr";
import "./App.css";

// null in production, so the dynamic import below is unreachable and the whole
// sniffr + zod graph is dropped from the bundle rather than merely unrendered
const SniffrDevtools = import.meta.env.DEV ? lazy(() => import("./sniffr-devtools")) : null;

type Call = { label: string; status: number };

export default function App() {
  const [log, setLog] = useState<Call[]>([]);

  const call = async (label: string, path: string, init?: RequestInit) => {
    const response = await fetch(`${API}${path}`, init);
    setLog((entries) => [{ label, status: response.status }, ...entries].slice(0, 8));
  };

  return (
    <main>
      <h1>sniffr</h1>
      <p className="lede">
        Live calls to <code>jsonplaceholder.typicode.com</code>, diffed against the zod schemas in{" "}
        <code>src/sniffr.ts</code>. Those schemas contain a mistake a real codebase would make —
        open the pill to see sniffr find it.
      </p>

      <div className="actions">
        <button type="button" onClick={() => void call("GET /users", "/users")}>
          GET /users
        </button>
        <button type="button" onClick={() => void call("GET /users/1", "/users/1")}>
          GET /users/1
        </button>
        <button type="button" onClick={() => void call("GET /posts", "/posts")}>
          GET /posts
        </button>
        <button
          type="button"
          onClick={() =>
            void call("POST /posts", "/posts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              // userId should be a number — sent as a string on purpose
              body: JSON.stringify({ userId: "1", title: "hello", body: "world" }),
            })
          }
        >
          POST /posts
        </button>
      </div>

      {SniffrDevtools && (
        <Suspense fallback={null}>
          <SniffrDevtools />
        </Suspense>
      )}

      <ul className="notes">
        <li>
          <code>address.geo.lat</code> and <code>lng</code> are declared as numbers. The API sends
          strings — that is the breaking change.
        </li>
        <li>
          <code>/users</code> and <code>/users/1</code> are separate models: sniffr normalises the
          second to <code>/users/:id</code>.
        </li>
        <li>
          <code>/posts</code> returns 100 rows, so <code>title</code> passes the enum cardinality
          cap and widens to <code>string</code> instead of a 100-member union.
        </li>
      </ul>

      <ul className="log">
        {log.map((entry, index) => (
          <li key={`${entry.label}-${String(index)}`}>
            {entry.label} → {entry.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
