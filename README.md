# WiFi Phy Lab - Web

A static site that runs an 802.11a/n/ac/ax/be OFDM waveform generator **fully
client-side** in the browser. The C core is compiled to WebAssembly
(`ofdm_general.wasm`), so waveforms are generated directly in the browser via
`Module.callMain()` — with no server — and rendered in both the time and
frequency domains.

It can be served as-is from GitHub Pages (no backend required).

## Files

- `index.html` — UI
- `app.js` — control handling, WASM invocation, canvas rendering
- `styles.css`
- `ofdm_general.js` / `ofdm_general.wasm` — Emscripten build artifacts

## Note

These files are **build artifacts**. Do not edit them directly. The sources
(the C code and the original front-end) are managed in a private repository;
when they change, they are rebuilt there and the output is updated in this
repository.

## License

Proprietary (All Rights Reserved). See [LICENSE](./LICENSE) for details. Viewing
and running the site in a browser is permitted, but copying, redistribution,
re-hosting, reverse engineering, and reuse require prior written permission.

## Local preview

```sh
python3 -m http.server 8000
# http://localhost:8000/
```
