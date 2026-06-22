# OFDM General Wideband Graph — Web

802.11a/n/ac/ax/be OFDM 파형 생성기를 브라우저에서 **완전히 클라이언트사이드**로 실행하는
정적 사이트입니다. C 코어를 WebAssembly로 컴파일(`ofdm_general.wasm`)해, 서버 없이
브라우저에서 직접 `Module.callMain()`으로 파형을 생성하고 시간/주파수 도메인을 그립니다.

GitHub Pages로 그대로 서빙 가능합니다 (별도 백엔드 불필요).

## 파일

- `index.html` — UI
- `app.js` — 컨트롤 처리, WASM 호출, 캔버스 렌더링
- `styles.css`
- `ofdm_general.js` / `ofdm_general.wasm` — Emscripten 빌드 산출물

## 주의

이 파일들은 **빌드 산출물**입니다. 직접 수정하지 마세요. 소스(C, 프런트엔드 원본)는
private 저장소에서 관리되며, 변경 시 거기서 다시 빌드해 이 저장소에 반영합니다.

## 로컬 미리보기

```sh
python3 -m http.server 8000
# http://localhost:8000/
```
