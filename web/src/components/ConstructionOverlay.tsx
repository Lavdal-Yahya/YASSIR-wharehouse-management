import type { ReactNode } from 'react';

// ConstructionOverlay — a visible "work in progress" treatment for
// screens or sections whose UI is drafted but whose backend isn't
// wired yet. The children render behind a blur so you can read what
// the target design will look like; two diagonal yellow-and-black
// hazard tapes cross the surface; a plain message sits in the middle.
//
// The construction metaphor is deliberate: "not broken, being built".
// Any interactive control inside `children` is blocked from receiving
// events (pointer-events-none on the blurred layer) so a user can't
// accidentally click a button they can't yet use.

type Variant = 'block' | 'ribbon';

type Props = {
  /** The mocked / read-only content shown blurred underneath. */
  children: ReactNode;
  /** Short caption — usually the feature name. */
  title: ReactNode;
  /** One-line body — the "why" in the user's language. */
  message?: ReactNode;
  /** 'block' fills the given box; 'ribbon' floats a compact banner across the top-end corner. */
  variant?: Variant;
};

export function ConstructionOverlay({
  children,
  title,
  message,
  variant = 'block',
}: Props) {
  if (variant === 'ribbon') {
    return (
      <div className="relative">
        {children}
        {/* Ribbon — a compact yellow/black tape floating at the top-end
            corner. Best for tagging a single control (button, tile) so
            the user knows the click won't do anything yet. */}
        <div
          className="pointer-events-none absolute -end-2 -top-2 rotate-6 select-none rounded-sm border-2 border-[#1B1C26] bg-[#F5C400] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1B1C26] shadow-sm"
          aria-label={typeof title === 'string' ? title : undefined}
        >
          {title}
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate overflow-hidden rounded-lg">
      {/* Layer 1 — the blurred mock. pointer-events-none so no click
          reaches the disabled controls. aria-hidden because a screen
          reader shouldn't read a mock. */}
      <div
        className="pointer-events-none select-none blur-[3px] opacity-70"
        aria-hidden
      >
        {children}
      </div>

      {/* Layer 2 — the tape. Two diagonal bands of the classic
          yellow/black hazard pattern, one clockwise and one counter-
          clockwise, so the surface reads as "under construction" at
          a single glance regardless of orientation. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute top-1/3 -start-4 -end-4 h-9 -rotate-6"
          style={{
            background:
              'repeating-linear-gradient(45deg, #F5C400 0, #F5C400 22px, #1B1C26 22px, #1B1C26 44px)',
          }}
        />
        <div
          className="absolute bottom-1/3 -start-4 -end-4 h-9 rotate-6"
          style={{
            background:
              'repeating-linear-gradient(45deg, #F5C400 0, #F5C400 22px, #1B1C26 22px, #1B1C26 44px)',
          }}
        />
      </div>

      {/* Layer 3 — message chip. Sits above the tape so the copy stays
          legible; readable to screen readers. */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-sm rounded-lg border-2 border-[#1B1C26] bg-surface p-5 text-center shadow-[0_8px_24px_rgba(24,25,40,0.18)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#B58A00]">
            {/* Static hard-coded to stay honest across every language —
                the emoji is a well-known WIP glyph. */}
            🚧 Work in progress
          </div>
          <div className="mt-2 text-[17px] font-semibold text-ink">
            {title}
          </div>
          {message ? (
            <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
