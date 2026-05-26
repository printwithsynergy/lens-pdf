/**
 * Inlined pdf.js text layer + annotation layer stylesheets.
 *
 * react-pdf ships these as `.css` files that you'd normally
 * `import "react-pdf/dist/Page/{Text,Annotation}Layer.css"` —
 * but `.css` side-effect imports break Node ESM during SSR
 * (the host's Astro / Next / Vite server can't resolve the
 * extension), and any consumer who imports any symbol from
 * lens-pdf into a server module triggers the chain and the
 * server boots into ERR_UNKNOWN_FILE_EXTENSION.
 *
 * We inline the CSS as a single string and inject via a
 * `<style>` tag on the client only. Stays in sync with whichever
 * react-pdf version we lock to (search "Copy from
 * node_modules/react-pdf/dist/Page/" when bumping react-pdf).
 *
 * Source: react-pdf@10.4.1 — Mozilla Public License 2.0 (the CSS
 * itself is © Mozilla Foundation, Apache-2.0).
 */
export const REACT_PDF_CSS = `
:root {
  --react-pdf-annotation-layer: 1;
  --annotation-unfocused-field-background: url("data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>");
  --input-focus-border-color: Highlight;
  --input-focus-outline: 1px solid Canvas;
  --input-unfocused-border-color: transparent;
  --input-disabled-border-color: transparent;
  --input-hover-border-color: black;
  --link-outline: none;
  --react-pdf-text-layer: 1;
  --highlight-bg-color: rgba(180, 0, 170, 1);
  --highlight-selected-bg-color: rgba(0, 100, 0, 1);
}

@media screen and (forced-colors: active) {
  :root {
    --input-focus-border-color: CanvasText;
    --input-unfocused-border-color: ActiveText;
    --input-disabled-border-color: GrayText;
    --input-hover-border-color: Highlight;
    --link-outline: 1.5px solid LinkText;
    --highlight-bg-color: Highlight;
    --highlight-selected-bg-color: ButtonText;
  }
  .annotationLayer .textWidgetAnnotation :is(input, textarea):required,
  .annotationLayer .choiceWidgetAnnotation select:required,
  .annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) input:required {
    outline: 1.5px solid selectedItem;
  }
  .annotationLayer .linkAnnotation:hover {
    backdrop-filter: invert(100%);
  }
}

.annotationLayer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  transform-origin: 0 0;
  z-index: 3;
}

.annotationLayer[data-main-rotation='90'] .norotate {
  transform: rotate(270deg) translateX(-100%);
}
.annotationLayer[data-main-rotation='180'] .norotate {
  transform: rotate(180deg) translate(-100%, -100%);
}
.annotationLayer[data-main-rotation='270'] .norotate {
  transform: rotate(90deg) translateY(-100%);
}

.annotationLayer canvas {
  position: absolute;
  width: 100%;
  height: 100%;
}

.annotationLayer section {
  position: absolute;
  text-align: initial;
  pointer-events: auto;
  box-sizing: border-box;
  margin: 0;
  transform-origin: 0 0;
}

.annotationLayer .linkAnnotation {
  outline: var(--link-outline);
}

.textLayer.selecting ~ .annotationLayer section {
  pointer-events: none;
}

.annotationLayer :is(.linkAnnotation, .buttonWidgetAnnotation.pushButton) > a {
  position: absolute;
  font-size: 1em;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.annotationLayer :is(.linkAnnotation, .buttonWidgetAnnotation.pushButton) > a:hover {
  opacity: 0.2;
  background: rgba(255, 255, 0, 1);
  box-shadow: 0 2px 10px rgba(255, 255, 0, 1);
}

.annotationLayer .textAnnotation img {
  position: absolute;
  cursor: pointer;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.annotationLayer .textWidgetAnnotation :is(input, textarea),
.annotationLayer .choiceWidgetAnnotation select,
.annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) input {
  background-image: var(--annotation-unfocused-field-background);
  border: 2px solid var(--input-unfocused-border-color);
  box-sizing: border-box;
  font: calc(9px * var(--total-scale-factor)) sans-serif;
  height: 100%;
  margin: 0;
  vertical-align: top;
  width: 100%;
}

.annotationLayer .textWidgetAnnotation :is(input, textarea):required,
.annotationLayer .choiceWidgetAnnotation select:required,
.annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) input:required {
  outline: 1.5px solid red;
}

.annotationLayer .choiceWidgetAnnotation select option {
  padding: 0;
}

.annotationLayer .buttonWidgetAnnotation.radioButton input {
  border-radius: 50%;
}

.annotationLayer .textWidgetAnnotation textarea {
  resize: none;
}

.annotationLayer .textWidgetAnnotation :is(input, textarea)[disabled],
.annotationLayer .choiceWidgetAnnotation select[disabled],
.annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) input[disabled] {
  background: none;
  border: 2px solid var(--input-disabled-border-color);
  cursor: not-allowed;
}

.annotationLayer .textWidgetAnnotation :is(input, textarea):hover,
.annotationLayer .choiceWidgetAnnotation select:hover,
.annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) input:hover {
  border: 2px solid var(--input-hover-border-color);
}
.annotationLayer .textWidgetAnnotation :is(input, textarea):hover,
.annotationLayer .choiceWidgetAnnotation select:hover,
.annotationLayer .buttonWidgetAnnotation.checkBox input:hover {
  border-radius: 2px;
}

.annotationLayer .textWidgetAnnotation :is(input, textarea):focus,
.annotationLayer .choiceWidgetAnnotation select:focus {
  background: none;
  border: 2px solid var(--input-focus-border-color);
  border-radius: 2px;
  outline: var(--input-focus-outline);
}

.annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) :focus {
  background-image: none;
  background-color: transparent;
}

.annotationLayer .buttonWidgetAnnotation.checkBox :focus {
  border: 2px solid var(--input-focus-border-color);
  border-radius: 2px;
  outline: var(--input-focus-outline);
}

.annotationLayer .buttonWidgetAnnotation.radioButton :focus {
  border: 2px solid var(--input-focus-border-color);
  outline: var(--input-focus-outline);
}

.annotationLayer .buttonWidgetAnnotation.checkBox input:checked::before,
.annotationLayer .buttonWidgetAnnotation.checkBox input:checked::after,
.annotationLayer .buttonWidgetAnnotation.radioButton input:checked::before {
  background-color: CanvasText;
  content: '';
  display: block;
  position: absolute;
}

.annotationLayer .buttonWidgetAnnotation.checkBox input:checked::before,
.annotationLayer .buttonWidgetAnnotation.checkBox input:checked::after {
  height: 80%;
  left: 45%;
  width: 1px;
}

.annotationLayer .buttonWidgetAnnotation.checkBox input:checked::before {
  transform: rotate(45deg);
}

.annotationLayer .buttonWidgetAnnotation.checkBox input:checked::after {
  transform: rotate(-45deg);
}

.annotationLayer .buttonWidgetAnnotation.radioButton input:checked::before {
  border-radius: 50%;
  height: 50%;
  left: 30%;
  top: 20%;
  width: 50%;
}

.annotationLayer .textWidgetAnnotation input.comb {
  font-family: monospace;
  padding-left: 2px;
  padding-right: 0;
}

.annotationLayer .textWidgetAnnotation input.comb:focus {
  width: 103%;
}

.annotationLayer .buttonWidgetAnnotation:is(.checkBox, .radioButton) input {
  appearance: none;
}

.annotationLayer .popupTriggerArea {
  height: 100%;
  width: 100%;
}

.annotationLayer .fileAttachmentAnnotation .popupTriggerArea {
  position: absolute;
}

.annotationLayer .popupWrapper {
  position: absolute;
  font-size: calc(9px * var(--total-scale-factor));
  width: 100%;
  min-width: calc(180px * var(--total-scale-factor));
  pointer-events: none;
}

.annotationLayer .popup {
  position: absolute;
  max-width: calc(180px * var(--total-scale-factor));
  background-color: rgba(255, 255, 153, 1);
  box-shadow: 0 calc(2px * var(--total-scale-factor)) calc(5px * var(--total-scale-factor))
    rgba(136, 136, 136, 1);
  border-radius: calc(2px * var(--total-scale-factor));
  padding: calc(6px * var(--total-scale-factor));
  margin-left: calc(5px * var(--total-scale-factor));
  cursor: pointer;
  font: message-box;
  white-space: normal;
  word-wrap: break-word;
  pointer-events: auto;
}

.annotationLayer .popup > * {
  font-size: calc(9px * var(--total-scale-factor));
}

.annotationLayer .popup h1 {
  display: inline-block;
}

.annotationLayer .popupDate {
  display: inline-block;
  margin-left: calc(5px * var(--total-scale-factor));
}

.annotationLayer .popupContent {
  border-top: 1px solid rgba(51, 51, 51, 1);
  margin-top: calc(2px * var(--total-scale-factor));
  padding-top: calc(2px * var(--total-scale-factor));
}

.annotationLayer .richText > * {
  white-space: pre-wrap;
  font-size: calc(9px * var(--total-scale-factor));
}

.annotationLayer .highlightAnnotation,
.annotationLayer .underlineAnnotation,
.annotationLayer .squigglyAnnotation,
.annotationLayer .strikeoutAnnotation,
.annotationLayer .freeTextAnnotation,
.annotationLayer .lineAnnotation svg line,
.annotationLayer .squareAnnotation svg rect,
.annotationLayer .circleAnnotation svg ellipse,
.annotationLayer .polylineAnnotation svg polyline,
.annotationLayer .polygonAnnotation svg polygon,
.annotationLayer .caretAnnotation,
.annotationLayer .inkAnnotation svg polyline,
.annotationLayer .stampAnnotation,
.annotationLayer .fileAttachmentAnnotation {
  cursor: pointer;
}

.annotationLayer section svg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.annotationLayer .annotationTextContent {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  color: transparent;
  user-select: none;
  pointer-events: none;
}

.annotationLayer .annotationTextContent span {
  width: 100%;
  display: inline-block;
}

[data-main-rotation='90'] {
  transform: rotate(90deg) translateY(-100%);
}
[data-main-rotation='180'] {
  transform: rotate(180deg) translate(-100%, -100%);
}
[data-main-rotation='270'] {
  transform: rotate(270deg) translateX(-100%);
}

.textLayer {
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  z-index: 2;
}

.textLayer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  margin: 0;
  transform-origin: 0 0;
}

.textLayer span.markedContent {
  top: 0;
  height: 0;
}

.textLayer .highlight {
  margin: -1px;
  padding: 1px;
  background-color: var(--highlight-bg-color);
  border-radius: 4px;
}

.textLayer .highlight.appended {
  position: initial;
}

.textLayer .highlight.begin {
  border-radius: 4px 0 0 4px;
}

.textLayer .highlight.end {
  border-radius: 0 4px 4px 0;
}

.textLayer .highlight.middle {
  border-radius: 0;
}

.textLayer .highlight.selected {
  background-color: var(--highlight-selected-bg-color);
}

.textLayer br::selection {
  background: transparent;
}

.textLayer .endOfContent {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: -1;
  cursor: default;
  user-select: none;
}

.textLayer.selecting .endOfContent {
  top: 0;
}

.hiddenCanvasElement {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  display: none;
}
`;

const REACT_PDF_CSS_FLAG = "data-lens-pdf-react-pdf-css";

/**
 * Inject the inlined react-pdf CSS into the document head once.
 * Safe to call multiple times — subsequent calls no-op via a
 * `data-` attribute marker on the injected `<style>` tag.
 *
 * SSR-safe: returns immediately if `document` is undefined.
 */
export function ensureReactPdfCss(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${REACT_PDF_CSS_FLAG}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(REACT_PDF_CSS_FLAG, "");
  style.textContent = REACT_PDF_CSS;
  document.head.appendChild(style);
}
