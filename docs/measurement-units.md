---
title: "Measurement units"
description: "Built-in millimetre, inch, point, pica, and agate definitions, plus the MeasurementUnit protocol for adding custom units to the MeasureTool."
group: "Reference"
order: 7
---

# Measurement units

`MeasureTool` accepts a `units` prop. The five built-ins cover most print
workflows; pass any subset, or write your own conforming to the
`MeasurementUnit` Protocol.

## Built-ins

```ts
import {
  mmUnit,
  inchUnit,
  pointUnit,
  picaUnit,
  agateUnit,
  defaultMeasurementUnits,   // [mm, in, pt]
  allMeasurementUnits,       // [mm, in, pt, pica, agate]
} from "@printwithsynergy/lens-pdf/units";
```

| Unit | id | label | Conversion (from PDF points) |
| --- | --- | --- | --- |
| Millimetre | `mm` | `mm` | `pt × 25.4 / 72` |
| Inch | `in` | `in` | `pt / 72` |
| Point | `pt` | `pt` | identity (PDF native) |
| Pica | `pica` | `pc` | `pt / 12` |
| Agate | `agate` | `ag` | `pt / 5.5` |

`MeasureTool` defaults to `defaultMeasurementUnits` (mm, in, pt). Pass
`allMeasurementUnits` to add pica + agate, or supply a custom subset.

```tsx
import { MeasureTool } from "@printwithsynergy/lens-pdf/components";
import { allMeasurementUnits } from "@printwithsynergy/lens-pdf/units";

<MeasureTool
  pageWidthPts={612}
  pageHeightPts={792}
  canvasWidth={800}
  canvasHeight={1036}
  units={allMeasurementUnits}
/>;
```

## Custom units

The Protocol is small — anchor your conversions to PDF points (1 pt =
1/72 inch) and you're done.

```ts
import type { MeasurementUnit } from "@printwithsynergy/lens-pdf/plugin";

export const cmUnit: MeasurementUnit = {
  id: "cm",
  label: "cm",
  fromPoints: (pts) => (pts * 25.4) / 72 / 10,
  toPoints: (cm) => (cm * 10 * 72) / 25.4,
};

export const emUnit: MeasurementUnit = {
  id: "em",
  label: "em",
  // 1em = 12pt by typographic convention; adjust if you have a real
  // type-size in scope.
  fromPoints: (pts) => pts / 12,
  toPoints: (em) => em * 12,
};
```

Pass them to `MeasureTool` directly, or merge with the built-ins:

```tsx
<MeasureTool
  units={[mmUnit, cmUnit, inchUnit, pointUnit]}
  /* … */
/>;
```

The `id` is used for keying / preference storage; keep it stable across
versions if you persist user choice.
