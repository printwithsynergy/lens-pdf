/**
 * Built-in measurement units shipped with the OSS viewer.
 *
 * The `MeasurementUnit` slot was reserved in Phase 1; this module
 * is the Phase-2 implementation. Five units are wired by default:
 * millimetre, inch, point, pica, agate. Hosts can pass any subset
 * (or extend with their own custom units) via the `units` prop on
 * `MeasureTool`.
 *
 * Conversions are anchored to PDF points (1 pt = 1/72 inch). The
 * inch is exact (25.4 mm), so all derived units are deterministic.
 *
 * @public
 */

import type { MeasurementUnit } from "../plugin/types";

/**
 * Millimetre. The metric default for print preflight workflows.
 *
 * @public
 */
export const mmUnit: MeasurementUnit = {
  id: "mm",
  label: "mm",
  fromPoints: (points) => points * (25.4 / 72),
  toPoints: (mm) => mm * (72 / 25.4),
};

/**
 * Inch. The U.S. print standard.
 *
 * @public
 */
export const inchUnit: MeasurementUnit = {
  id: "in",
  label: "in",
  fromPoints: (points) => points / 72,
  toPoints: (inches) => inches * 72,
};

/**
 * Point. The PDF coordinate-space native unit (1 pt = 1/72 inch).
 *
 * @public
 */
export const pointUnit: MeasurementUnit = {
  id: "pt",
  label: "pt",
  fromPoints: (points) => points,
  toPoints: (pt) => pt,
};

/**
 * Pica. Twelve points. Used in classical typography for body
 * widths and column gutters.
 *
 * @public
 */
export const picaUnit: MeasurementUnit = {
  id: "pica",
  label: "pc",
  fromPoints: (points) => points / 12,
  toPoints: (pica) => pica * 12,
};

/**
 * Agate. 5.5 points. Historical newspaper measurement for column
 * inches in classified ads.
 *
 * @public
 */
export const agateUnit: MeasurementUnit = {
  id: "agate",
  label: "ag",
  fromPoints: (points) => points / 5.5,
  toPoints: (agate) => agate * 5.5,
};

/**
 * The five built-in units in display order: mm, in, pt, pica,
 * agate. `MeasureTool` defaults to a subset (`defaultMeasurementUnits`)
 * for readability; consumers that want all five pass this array.
 *
 * @public
 */
export const allMeasurementUnits: ReadonlyArray<MeasurementUnit> = [
  mmUnit,
  inchUnit,
  pointUnit,
  picaUnit,
  agateUnit,
];

/**
 * Default units shown by `MeasureTool` when no `units` prop is
 * supplied: mm, in, pt. The two old-school print units (pica,
 * agate) are available as opt-ins via `allMeasurementUnits` or
 * by passing them explicitly — the readout would otherwise get
 * cluttered for the common case.
 *
 * @public
 */
export const defaultMeasurementUnits: ReadonlyArray<MeasurementUnit> = [
  mmUnit,
  inchUnit,
  pointUnit,
];
