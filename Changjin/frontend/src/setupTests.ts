import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom ships no TextEncoder/TextDecoder, and react-router reaches for them at
// import time. Without these, any test that renders a routed component fails
// on `ReferenceError: TextEncoder is not defined` before its own code runs.
Object.assign(globalThis, {
  TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  TextDecoder: globalThis.TextDecoder ?? TextDecoder,
});
