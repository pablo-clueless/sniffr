import { useEffect } from "react";
import { SniffrOverlay, useSniffr } from "@pablo_clueless/sniffr/react";

import { start } from "./sniffr";

// Everything that touches sniffr — and therefore zod — lives behind this
// module. App.tsx only reaches it through a dynamic import guarded by DEV, so
// none of it reaches a production bundle.
export default function SniffrDevtools() {
  // start() returns { stop }, which is exactly the cleanup useEffect wants
  useEffect(() => start().stop, []);

  const { models } = useSniffr();
  const changes = Object.values(models).flatMap((model) => model.changes);
  const breaking = changes.filter((change) => change.severity === "breaking").length;
  const additive = changes.filter((change) => change.severity === "additive").length;

  return (
    <>
      <dl className="stats">
        <div>
          <dt>endpoints</dt>
          <dd>{Object.keys(models).length}</dd>
        </div>
        <div>
          <dt>breaking</dt>
          <dd className={breaking > 0 ? "bad" : undefined}>{breaking}</dd>
        </div>
        <div>
          <dt>additive</dt>
          <dd>{additive}</dd>
        </div>
      </dl>
      <SniffrOverlay />
    </>
  );
}
