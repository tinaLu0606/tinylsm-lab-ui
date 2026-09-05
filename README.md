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

Start `tinylsm_lab_server` from the parent repository first, then open the Vite
URL and create a live session. Omit `VITE_LAB_API=live` to use Mock mode.

- **Playground**: Put, Get, Delete, Scan, Compact, text/Hex/Base64 input,
  state diffs, batch step/run/stop and replay.
- **Storage**: real directory file list and Manifest references. Paged format
  decoding and range hex are a Goal 3 boundary.
- **Timeline**: filterable bounded event log from the C++ session. Resource and
  latency aggregation are a Goal 3 boundary.
- **Workload**: Mock supports the deterministic demonstration; Live marks it
  unavailable until the Goal 3 reference-model runner exists.
- **Recovery**: Live marks all destructive scenarios unavailable until the
  Goal 4 sandbox worker exists.
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

Goal 2 implements the C++ Lab Server, copied diagnostic state, serialized
basic operations, real file listing, bounded operation/events, and SSE replay.
The server listens only on loopback and caps request bodies at 8 MiB. The
following remain deliberately unavailable: paged Manifest/WAL/SSTable decoding,
raw file ranges, process RSS/CPU, deterministic workloads, and destructive
recovery workers. Vite proxies `/api` to `http://127.0.0.1:8080`.
