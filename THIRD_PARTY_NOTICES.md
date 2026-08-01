# Third-party notices

Droptic incorporates or bundles the following optical-transfer software:

- RaptorQR core, fast QR WASM, and RaptorQ WASM 0.1.1 — Copyright © 2026 Haixiang — MIT License.
- hash-wasm 4.12.0 — Copyright © 2020 Dani Biró — MIT License. Its embedded implementations may carry additional similarly permissive notices supplied with that package.
- zxing-wasm 3.1.2 — Copyright © 2023 Ze-Zheng Wu — MIT License. The generated binary incorporates ZXing-C++, whose upstream license and notices must also accompany a production distribution.

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The complete package-specific license files and embedded implementation notices are present in the resolved package sources under `node_modules` during a locked build. A release packaging step should copy all of them verbatim into the distributed notices bundle.
