# Themes

One file per theme. To reskin the app, edit a file here — nothing else.

| File | Applies to | Selector |
| --- | --- | --- |
| `rebels.css` | light mode | `:root` |
| `sith.css` | dark mode | `.dark` |

Both are imported by `src/index.css`.

## Adding a theme

1. Copy `sith.css` to `your-theme.css`.
2. Change the selector at the top (`.dark` → `.your-theme`).
3. Change the values in the **Palette** block — that's the only part you need to
   touch. Everything below it is wiring that maps your palette onto the shadcn
   tokens the components read.
4. Import it in `src/index.css`.
5. Put the class on `<html>`.

## Rules

- Every token in the contract must be set, or components fall back to whatever
  the previous theme left behind.
- Colours are plain hex on purpose. shadcn ships oklch; hex is easier to paste
  from a design tool and every browser we target reads it fine.
- `--*-foreground` is the text colour that sits **on** its pair. Check contrast
  when changing a pair, not just the background.
- Fonts live in `src/index.css`, not here, since they are shared across themes.

## Contract

Surfaces: `--background` `--foreground` `--card` `--card-foreground`
`--popover` `--popover-foreground` `--sidebar` `--sidebar-foreground`

Intent: `--primary` `--secondary` `--accent` `--muted` `--destructive`
(each with a matching `--*-foreground`)

Lines and focus: `--border` `--input` `--ring` `--sidebar-border` `--sidebar-ring`

Data: `--chart-1` … `--chart-5`

Card rarity: `--common` `--uncommon` `--rare` `--mythic` (aliased to `--c`
`--u` `--r` `--lr` `--p`)
