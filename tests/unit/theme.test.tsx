// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeSwitch } from "../../src/design/ThemeSwitch";
import { startTheme } from "../../src/design/theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

describe("theme", () => {
  it("defaults to light, and remembers a choice", () => {
    startTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("forma-theme")).toBe("dark");
    expect(
      screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
  it("cycles light → dark → system from the header button", () => {
    render(<ThemeSwitch variant="button" />);
    fireEvent.click(screen.getByRole("button", { name: /Theme: Light/ }));
    fireEvent.click(screen.getByRole("button", { name: /Theme: Dark/ }));
    expect(localStorage.getItem("forma-theme")).toBe("system");
    expect(screen.getByRole("button", { name: /Theme: System/ })).toBeTruthy();
  });
});
