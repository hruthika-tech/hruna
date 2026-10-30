// The analytics dashboard's colours (the studio analytics palette).
//   dark green  — headings, values, the selected range
//   moss green  — card borders, accents, chart gridlines
//   beige       — page background, empty states, table headers
//   rosy brown  — second chart series, the tracking notice
//   midnight    — first chart series, links
// Chart pair (midnight + rosy brown) checked with the dataviz palette validator on white: colour-vision
// separation ΔE 26 (protan), normal-vision ΔE 34 — clearly distinct. Rosy brown is 2.4:1 against white,
// so every chart also carries a legend, end dots, hover values and a table view.
// Tailwind classes in the components spell these hex values out literally (Tailwind needs literal class names).
export const ANALYTICS_COLORS = {
  darkGreen: "#0A3323",
  moss: "#839958",
  beige: "#F7F4D5",
  rosyBrown: "#D3968C",
  midnight: "#105666",
} as const;
