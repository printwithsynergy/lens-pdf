import { describe, expect, it } from "vitest";
import { isUnwired, markUnwired } from "./services";

describe("isUnwired", () => {
  it("treats null/undefined as unwired", () => {
    expect(isUnwired(null)).toBe(true);
    expect(isUnwired(undefined)).toBe(true);
  });

  it("returns false for a plain object the host substituted in", () => {
    expect(isUnwired({})).toBe(false);
    expect(isUnwired({ getPageImageUrl: () => "/x.png" })).toBe(false);
  });

  it("returns true for an object that markUnwired tagged", () => {
    expect(isUnwired(markUnwired({}))).toBe(true);
  });

  it("does not bleed the marker onto sibling objects", () => {
    const a = markUnwired({});
    const b = {};
    expect(isUnwired(a)).toBe(true);
    expect(isUnwired(b)).toBe(false);
  });
});

describe("markUnwired", () => {
  it("returns the same object reference (chainable)", () => {
    const obj = { foo: 1 };
    expect(markUnwired(obj)).toBe(obj);
  });

  it("hides the marker from Object.keys + JSON.stringify", () => {
    const obj = markUnwired({ visible: true });
    expect(Object.keys(obj)).toEqual(["visible"]);
    expect(JSON.parse(JSON.stringify(obj))).toEqual({ visible: true });
  });

  it("survives a host wrapping the service in a new object", () => {
    // Hosts that build their service via spread {...defaultLayers, listLayers: …}
    // lose the marker on the spread copy — that's intended (the spread
    // produces a *new* object, which by definition is wired).
    const wrapped = { ...markUnwired({ a: 1 }) };
    expect(isUnwired(wrapped)).toBe(false);
  });

  it("ignores attempts to overwrite the marker", () => {
    const obj = markUnwired({});
    // The marker is non-writable. Strict mode throws; non-strict silently
    // ignores. Either way the value should not change.
    expect(() => {
      Object.defineProperty(obj, Symbol.for("@printwithsynergy/lens-pdf:unwired"), {
        value: false,
      });
    }).toThrow();
    expect(isUnwired(obj)).toBe(true);
  });
});
