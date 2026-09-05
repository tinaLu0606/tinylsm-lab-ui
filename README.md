# TinyLSM Lab UI

TinyLSM Lab is a local React and TypeScript workbench for exploring a storage
engine. Goal 1 is complete as a deterministic frontend prototype: it has a
stable typed API boundary and a `MockLabApi`, but it does **not** read a real
TinyLSM directory or measure a C++ process yet.

## Run and verify

```sh
npm ci
npm run dev
npm test -- --run
npm run build
```

Open the Vite URL, create a mock session, then use the six workspaces:

- **Playground**: Put, Get, Delete, Scan, Compact, text/Hex/Base64 input,
  state diffs, batch step/run/stop and replay.
- **Storage**: simulated Manifest, WAL and SSTable tree; decoded metadata,
  records, blocks, CRC results, bounded hex previews and pagination.
- **Timeline**: filterable WAL/MemTable/flush/Manifest events and bounded
  resource/latency charts.
- **Workload**: seeded operation stream, ratios, distribution, rate, periodic
  reopen, Start/Pause/Resume/Cancel and mock correctness result.
- **Recovery**: three preview-first sandbox scenarios, clearly labelled as
  simulations until a safe C++ backend exists.
- **Reports**: JSON export/import, reproduction information and bounded
  IndexedDB report retention.

Every simulated value is labelled `Mock`; values that need a C++ Lab Server are
labelled `Unavailable`. This is intentional: the UI must never present mock
state as real engine evidence.

## Architecture

```text
React pages, shared components and LabContext
                  |
                  v
             LabApi interface
                  |
                  v
   MockLabApi (current deterministic implementation)
      |        |          |
      |        |          +-- recovery simulations and reports
      |        +------------- bounded events, metrics, storage snapshots
      +---------------------- ordered key model, WAL-first writes, flushes

Future: React -> HttpLabApi -> HTTP/SSE -> tinylsm_lab_server -> TinyLSM
```

`src/api/contracts.ts` owns the transport-shaped types and `LabApi.ts` owns the
frontend contract. A future `HttpLabApi` can replace `MockLabApi` without
putting storage parsing or correctness rules into page components. Binary input
is represented as Text, Hex or Base64; the future HTTP contract uses Base64 for
arbitrary bytes.

The UI bounds operation/event histories, keeps metric ring buffers, renders
history through a constrained scrolling surface, pages storage data, and stores
only preferences plus the eight most recent reports in IndexedDB.

## Current boundary

The C++ Lab Server, HTTP/SSE adapter, real file decoder, process RSS/CPU
metrics, worker processes and destructive fault injection are deliberately not
implemented in this goal. Vite still reserves `/api` for the eventual server at
`http://127.0.0.1:8080`.
