# TinyLSM Lab UI

TinyLSM Lab is a local React and TypeScript workbench for exploring a storage
engine. It supports two explicitly distinct transports: deterministic
`MockLabApi` for UI work, and `HttpLabApi` for a real local TinyLSM session.

## Run and verify

```sh
npm ci
VITE_LAB_API=live npm run dev
npm test -- --run
npm run build
```

For the packaged live Lab, run this from the parent repository instead:

```sh
git submodule update --init tools/lab_web
./run lab
```

It builds the UI with `VITE_LAB_API=live` and serves it and the loopback API
from one local process. Start `tinylsm_lab_server` from the parent repository
first when using Vite separately. Omit `VITE_LAB_API=live` to use Mock mode.

- **Playground**: Put, Get, Delete, Scan, Compact, text/Hex/Base64 input,
  state diffs, batch step/run/stop and replay.
- **Storage**: real directory file list and Manifest references. Paged format
  decoding and range hex are a Goal 3 boundary.
- **Timeline**: filterable bounded event log from the C++ session. Resource and
  latency aggregation are a Goal 3 boundary.
- **Workload**: seeded server-side reference-model validation with bounded
  detailed history and aggregate metrics.
- **Recovery**: preview and run three server-owned sandbox scenarios: no-Close
  worker exit, WAL-tail truncation, and Manifest CRC corruption. Reset removes
  only those sandboxes.
- **Reports**: JSON export/import, reproduction information and bounded
  IndexedDB report retention.

Every simulated value is labelled `Mock`; `Live` data comes only from the C++
server. Values not implemented by the live backend are labelled `Unavailable`.
This prevents mock state being presented as engine evidence.

## Architecture

```text
React pages, shared components and LabContext
                  |
                  v
             LabApi interface
                  |
                  v
   MockLabApi              HttpLabApi
      |                         |
      |                         +-- HTTP + SSE (Live only)
      |                                      |
      +-- deterministic UI model      tinylsm_lab_server -> TinyLSM
```

`src/api/contracts.ts` owns the transport-shaped types and `LabApi.ts` owns the
frontend contract. `HttpLabApi` converts Text/Hex/Base64 input to Base64 before
POSTing it, surfaces structured server status codes, and refreshes through SSE
events. It does not parse TinyLSM formats or decide correctness in React.

The UI bounds operation/event histories, keeps metric ring buffers, renders
history through a constrained scrolling surface, pages storage data, and stores
only preferences plus the eight most recent reports in IndexedDB.

## Current boundary

Goal 4 completes the local Lab workflow: paged storage decoding, bounded
resource and latency observations, deterministic workloads, and destructive
recovery scenarios all execute in the C++ server. The server listens only on
loopback and caps JSON request bodies at 8 MiB. Browser clients select scenario
identifiers only; the server creates and validates every mutable sandbox path.
Vite proxies `/api` to `http://127.0.0.1:8080`.
