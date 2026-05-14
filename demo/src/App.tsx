import { useMemo, useState } from "react";
import {
  ColorPickerTool,
  LayerPanel,
  MeasureTool,
  PageCanvas,
} from "@printwithsynergy/lens-pdf/components";
import {
  ViewerHostContext,
  ViewerServicesContext,
  createPdfJsFallback,
} from "@printwithsynergy/lens-pdf/host";
import type {
  PdfFallbackAdapter,
  ViewerServices,
} from "@printwithsynergy/lens-pdf/plugin";
import type { PageInfo } from "@printwithsynergy/lens-pdf/types";
import { mockServices } from "./mockServices";

type Mode = "empty" | "fallback" | "mock";

/**
 * A neutral fake PageInfo that gives the canvas + tools concrete
 * dimensions. The "empty" mode mounts components with this so we
 * can verify they hide silently rather than crash on missing data.
 *
 * 612 x 792 pts = US Letter portrait.
 */
const FAKE_PAGE: PageInfo = {
  page_num: 1,
  width_pts: 612,
  height_pts: 792,
  media_box: { x0: 0, y0: 0, x1: 612, y1: 792 },
  crop_box: null,
  trim_box: null,
  bleed_box: null,
  rotation: 0,
};

const ZOOM = 80;
const SCALE = ZOOM / 100;
const PTS_TO_PX = 96 / 72; // assume 96 dpi rendering

const CANVAS_W = Math.round(FAKE_PAGE.width_pts * PTS_TO_PX * SCALE);
const CANVAS_H = Math.round(FAKE_PAGE.height_pts * PTS_TO_PX * SCALE);

export function App() {
  const [mode, setMode] = useState<Mode>("empty");
  const [debug, setDebug] = useState(true);
  const [pdfUrl, setPdfUrl] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMeasure, setShowMeasure] = useState(false);

  const fallback = useMemo<PdfFallbackAdapter | undefined>(() => {
    if (mode !== "fallback" || !pdfUrl) return undefined;
    return createPdfJsFallback({ pdfUrl });
  }, [mode, pdfUrl]);

  const services: ViewerServices | undefined = mode === "mock" ? mockServices : undefined;

  const hostValue = {
    apiBase: "",
    jobApiBase: "",
    readOnly: false,
    debug,
    pdfUrl: mode === "fallback" ? pdfUrl : undefined,
    pdfFallback: fallback,
  };

  return (
    <>
      <header>
        <h1>LensPDF · smoke demo</h1>
        <p>
          Toggle modes to verify the hide-on-unwired contract from PR #3 / #4. Open the
          devtools console — with debug on, every component that hides logs once.
        </p>
      </header>
      <main>
        <aside>
          <h2>Mode</h2>
          <div className="modes">
            <button
              className={mode === "empty" ? "active" : ""}
              onClick={() => setMode("empty")}
            >
              Empty host
              <div className="hint">No services. Every tool should hide silently.</div>
            </button>
            <button
              className={mode === "fallback" ? "active" : ""}
              onClick={() => setMode("fallback")}
            >
              pdf.js fallback
              <div className="hint">PageCanvas + LayerPanel + ColorPicker work. Separations stay hidden.</div>
            </button>
            <button
              className={mode === "mock" ? "active" : ""}
              onClick={() => setMode("mock")}
            >
              Full mock
              <div className="hint">Every service stubbed. All wired-with-data paths visible.</div>
            </button>
          </div>

          <h2>Options</h2>
          <label className="row">
            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
            host.debug logs
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={showColorPicker}
              onChange={(e) => setShowColorPicker(e.target.checked)}
            />
            ColorPickerTool overlay
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={showMeasure}
              onChange={(e) => setShowMeasure(e.target.checked)}
            />
            MeasureTool overlay
          </label>

          {mode === "fallback" && (
            <>
              <h2>PDF URL</h2>
              <input
                type="text"
                placeholder="/sample.pdf or https://…"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
              />
              <div className="hint">
                Drop any PDF URL the browser can fetch. The pdf.js adapter parses it
                client-side; sign / scope it upstream as you would any host download URL.
              </div>
            </>
          )}
        </aside>

        <ViewerHostContext.Provider value={hostValue}>
          {services ? (
            <ViewerServicesContext.Provider value={services}>
              <Stage
                showColorPicker={showColorPicker}
                showMeasure={showMeasure}
              />
            </ViewerServicesContext.Provider>
          ) : (
            <Stage showColorPicker={showColorPicker} showMeasure={showMeasure} />
          )}
        </ViewerHostContext.Provider>

        <aside className="right">
          <h2>What you should see</h2>
          <ul style={{ paddingLeft: 16, color: "#cbd5e1", fontSize: 12, lineHeight: 1.6 }}>
            <li>
              <strong>Empty host</strong>: blank stage, no panels. Console logs once per
              hidden component (with debug on).
            </li>
            <li>
              <strong>Fallback (no URL)</strong>: PageCanvas tries the fallback but the
              adapter has nothing to render — empty stage. Set a PDF URL to see it work.
            </li>
            <li>
              <strong>Fallback + URL</strong>: PageCanvas renders the page raster.
              LayerPanel shows OCGs (or its empty state if the PDF has none).
            </li>
            <li>
              <strong>Full mock</strong>: PageCanvas shows a 1x1 placeholder, LayerPanel
              lists three fake layers, ColorPickerTool returns a fixed colour on click.
            </li>
          </ul>
        </aside>
      </main>
    </>
  );
}

function Stage({
  showColorPicker,
  showMeasure,
}: {
  showColorPicker: boolean;
  showMeasure: boolean;
}) {
  return (
    <div className="stage">
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_H, background: "#fff" }}>
          <PageCanvas
            jobId="demo"
            page={FAKE_PAGE}
            zoom={ZOOM}
            items={[]}
            selectedItem={null}
            onItemClick={() => {}}
          />
          {showColorPicker && (
            <ColorPickerTool
              jobId="demo"
              pageNum={FAKE_PAGE.page_num}
              pageWidthPts={FAKE_PAGE.width_pts}
              pageHeightPts={FAKE_PAGE.height_pts}
              canvasWidth={CANVAS_W}
              canvasHeight={CANVAS_H}
            />
          )}
          {showMeasure && (
            <MeasureTool
              pageWidthPts={FAKE_PAGE.width_pts}
              pageHeightPts={FAKE_PAGE.height_pts}
              canvasWidth={CANVAS_W}
              canvasHeight={CANVAS_H}
            />
          )}
        </div>
        <div style={{ width: 240, background: "#0b1220", borderRadius: 8, padding: 8 }}>
          <h2 style={{ fontSize: 12, textTransform: "uppercase", color: "#94a3b8", margin: "4px 8px 8px" }}>
            Layers panel
          </h2>
          <LayerPanel
            jobId="demo"
            enabledLayers={new Set()}
            onToggleLayer={() => {}}
            onSetAllLayers={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
